begin;

-- 1. Dodanie kolumn archiwizacji/blokady do public.users
alter table public.users
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists idx_users_is_archived
  on public.users(is_archived)
  where is_archived = true;

-- 2. Funkcja administracyjna blokowania i odblokowywania kont użytkowników
create or replace function public.admin_archive_user(
  p_session_token text,
  p_user_id uuid,
  p_archive boolean default true
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_target record;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;

  if p_user_id is null then
    return json_build_object('error', 'Brak ID użytkownika');
  end if;

  if v_admin.id = p_user_id and coalesce(p_archive, true) then
    return json_build_object('error', 'Nie możesz zablokować własnego konta administratora');
  end if;

  select id, username, name, role, is_archived into v_target
  from public.users
  where id = p_user_id
  for update;

  if v_target.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  if coalesce(p_archive, true) then
    update public.users
    set is_archived = true,
        archived_at = now(),
        archived_by = v_admin.name
    where id = p_user_id;

    -- Natychmiast unieważnij wszystkie aktywne sesje użytkownika
    update public.user_sessions
    set revoked_at = now()
    where user_id = p_user_id
      and revoked_at is null;

    -- Log audytowy
    insert into public.logs (
      action, category, entity_type, entity_id, actor_user_id,
      details, metadata
    ) values (
      'user_archive', 'admin', 'user', p_user_id::text, v_admin.id,
      format('Konto użytkownika %s (@%s) zostało zablokowane i zarchiwizowane przez %s', v_target.name, v_target.username, v_admin.name),
      json_build_object('user_id', p_user_id, 'username', v_target.username, 'archived_by', v_admin.name)
    );
  else
    update public.users
    set is_archived = false,
        archived_at = null,
        archived_by = null
    where id = p_user_id;

    insert into public.logs (
      action, category, entity_type, entity_id, actor_user_id,
      details, metadata
    ) values (
      'user_unarchive', 'admin', 'user', p_user_id::text, v_admin.id,
      format('Konto użytkownika %s (@%s) zostało odblokowane przez %s', v_target.name, v_target.username, v_admin.name),
      json_build_object('user_id', p_user_id, 'username', v_target.username, 'unarchived_by', v_admin.name)
    );
  end if;

  return json_build_object('ok', true, 'is_archived', coalesce(p_archive, true));
end;
$$;

revoke all on function public.admin_archive_user(text, uuid, boolean) from public;
grant execute on function public.admin_archive_user(text, uuid, boolean) to anon, authenticated;

-- 3. Aktualizacja session_user: zablokowany użytkownik nie ma autoryzacji
create or replace function public.session_user(p_session_token text)
returns table(id uuid, username text, name text, role text, routes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session record;
begin
  select s.id as session_id, s.user_id, s.device_label, s.impersonated_by_user_id,
    u.username, u.name, u.role, u.routes,
    admin_user.name as impersonator_name, admin_user.role as impersonator_role
  into v_session
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  left join public.users admin_user on admin_user.id = s.impersonated_by_user_id
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null and s.expires_at > now()
    and coalesce(u.is_archived, false) = false
  limit 1;
  if v_session.user_id is null then return; end if;

  perform set_config('app.audit_user_id', coalesce(v_session.impersonated_by_user_id, v_session.user_id)::text, true);
  perform set_config('app.audit_user_name', coalesce(v_session.impersonator_name, v_session.name, ''), true);
  perform set_config('app.audit_user_role', coalesce(v_session.impersonator_role, v_session.role, ''), true);
  perform set_config('app.audit_session_id', v_session.session_id::text, true);
  perform set_config('app.audit_device_label', coalesce(v_session.device_label, ''), true);
  perform set_config('app.audit_impersonated_by_user_id', coalesce(v_session.impersonated_by_user_id::text, ''), true);
  perform set_config('app.audit_effective_user_id', v_session.user_id::text, true);
  perform set_config('app.audit_effective_user_name', coalesce(v_session.name, ''), true);
  perform set_config('app.audit_effective_user_role', coalesce(v_session.role, ''), true);
  update public.user_sessions set last_seen_at = now()
  where user_sessions.id = v_session.session_id
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
  return query select v_session.user_id::uuid, v_session.username::text,
    v_session.name::text, v_session.role::text, v_session.routes::text;
end;
$$;

grant execute on function public.session_user(text) to anon, authenticated;

-- 4. Aktualizacja login_user: blokada logowania zarchiwizowanych kont
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
  v_attempted_username text := left(lower(trim(coalesce(p_username, ''))), 160);
begin
  select id, username, name, role, routes, password_hash,
    privacy_notice_ack_at, privacy_notice_ack_version, language, is_archived
  into v_user from public.users where username = v_attempted_username;

  if v_user.id is null then
    perform private.audit_login_failure(null, 'Nieznany użytkownik', 'anonymous', v_attempted_username, null, 'unknown_user');
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  if coalesce(v_user.is_archived, false) then
    perform private.audit_login_failure(v_user.id, v_user.name, v_user.role, v_user.username, v_user.id::text, 'account_archived');
    return json_build_object('error', 'Konto zostało zablokowane / zarchiwizowane');
  end if;

  if v_user.password_hash is null then
    perform private.audit_login_failure(v_user.id, v_user.name, v_user.role, v_user.username, v_user.id::text, 'password_not_set');
    return json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  end if;

  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    perform private.audit_login_failure(v_user.id, v_user.name, v_user.role, v_user.username, v_user.id::text, 'invalid_password');
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;
  return json_build_object(
    'ok', true, 'id', v_user.id, 'username', v_user.username, 'name', v_user.name,
    'role', v_user.role, 'routes', v_user.routes, 'language', v_user.language,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token, 'session_expires_at', v_session.expires_at
  );
end;
$$;

grant execute on function public.login_user(text, text) to anon, authenticated;

-- 5. Aktualizacja get_admin_users_data: zwraca is_archived, archived_at, archived_by
create or replace function public.get_admin_users_data(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_users json;
  v_employees json;
  v_driver_cars jsonb := '{}'::jsonb;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_users
  from (
    select
      u.id, u.username, u.name, u.role, u.routes, u.created_at, u.employee_id,
      e.name as employee_name,
      (u.password_hash is not null) as has_password,
      u.privacy_notice_ack_at, u.privacy_notice_ack_version,
      coalesce(u.is_archived, false) as is_archived,
      u.archived_at,
      u.archived_by
    from public.users u
    left join public.employees e on e.id = u.employee_id
    order by u.created_at
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_employees
  from (
    select e.id, e.name, e.active, e.group_name
    from public.employees e
    order by e.active desc, e.name
  ) x;

  select coalesce(value, '{}'::jsonb) into v_driver_cars
  from public.app_settings where key = 'driver_cars';

  return json_build_object(
    'ok', true,
    'users', v_users,
    'employees', v_employees,
    'driver_cars', coalesce(v_driver_cars, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_admin_users_data(text) to anon, authenticated;

-- 6. Aktualizacja list_drivers: wyklucza zablokowanych/zarchiwizowanych
create or replace function public.list_drivers(p_session_token text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  return query
  select u.id, u.name, u.role
  from public.users u
  where u.role in ('admin', 'admin_viewer_driver', 'driver')
    and coalesce(u.is_archived, false) = false
  order by u.name;
end;
$$;

grant execute on function public.list_drivers(text) to anon, authenticated;

-- 7. Aktualizacja get_weekly_route_plan: wyklucza zarchiwizowanych kierowców z puli i dostępności
create or replace function public.get_weekly_route_plan(
  p_session_token text,
  p_week_start date
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_start date;
  v_assignments json := '[]'::json;
  v_routes json := '[]'::json;
  v_clients json := '[]'::json;
  v_drivers json := '[]'::json;
  v_availability json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver') then
    raise exception 'Route plan access required' using errcode = '42501';
  end if;

  v_start := date_trunc(
    'week',
    coalesce(p_week_start, (now() at time zone 'Europe/Warsaw')::date)
  )::date;

  if v_user.role in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    select coalesce(
      json_agg(row_to_json(assignment_row) order by assignment_row.trip_date, assignment_row.driver_name),
      '[]'::json
    )
    into v_assignments
    from (
      select id, driver_id, driver_name, plan_date as trip_date, car,
             route_id::text as routes, planned_start, 'informational'::text as status
      from public.driver_route_plan_assignments
      where plan_date >= v_start and plan_date < v_start + 6
    ) assignment_row;

    select coalesce(json_agg(row_to_json(driver_row) order by driver_row.name), '[]'::json)
    into v_drivers
    from (
      select id, name, role
      from public.users
      where role in ('admin', 'admin_viewer_driver', 'driver')
        and coalesce(is_archived, false) = false
      order by name
    ) driver_row;

    select coalesce(
      json_agg(row_to_json(availability_row) order by availability_row.driver_id, availability_row.work_date),
      '[]'::json
    )
    into v_availability
    from (
      select app_user.id as driver_id, day_value::date as work_date,
        case
          when app_user.employee_id is null then null
          else coalesce(
            schedule.value,
            case when extract(isodow from day_value) = 6 then 'W' else 'I' end
          )
        end as value
      from public.users app_user
      cross join generate_series(v_start, v_start + 5, interval '1 day') as day_value
      left join public.schedule_entries schedule
        on schedule.employee_id = app_user.employee_id
       and schedule.year = extract(year from day_value)::integer
       and schedule.month = extract(month from day_value)::integer
       and schedule.day = extract(day from day_value)::integer
      where app_user.role in ('admin', 'admin_viewer_driver', 'driver')
        and coalesce(app_user.is_archived, false) = false
    ) availability_row;
  else
    select coalesce(json_agg(row_to_json(assignment_row) order by assignment_row.trip_date), '[]'::json)
    into v_assignments
    from (
      select id, driver_id, driver_name, plan_date as trip_date, car,
             route_id::text as routes, planned_start, 'informational'::text as status
      from public.driver_route_plan_assignments
      where driver_id = v_user.id
        and plan_date >= v_start and plan_date < v_start + 6
    ) assignment_row;
  end if;

  select coalesce(json_agg(row_to_json(route_row) order by route_row.sort_order), '[]'::json)
  into v_routes
  from (
    select route.*,
      coalesce((
        select json_agg(json_build_object(
          'id', rule.id,
          'weekday', rule.weekday,
          'interval_weeks', rule.interval_weeks,
          'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
        ) order by rule.weekday)
        from public.route_service_rules rule
        where rule.route_id = route.id
      ), '[]'::json) as service_rules
    from public.routes route
  ) route_row;

  select coalesce(json_agg(row_to_json(client_row) order by client_row.sort_order), '[]'::json)
  into v_clients
  from (
    select client.*,
      coalesce((
        select json_agg(json_build_object(
          'id', rule.id,
          'weekday', rule.weekday,
          'interval_weeks', rule.interval_weeks,
          'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
        ) order by rule.weekday)
        from public.client_service_rules rule
        where rule.client_id = client.id
      ), '[]'::json) as service_rules
    from public.clients client
    where client.archived_at is null
  ) client_row;

  return json_build_object(
    'ok', true,
    'week_start', v_start,
    'trips', v_assignments,
    'routes', v_routes,
    'clients', v_clients,
    'drivers', v_drivers,
    'availability', v_availability
  );
end;
$$;

grant execute on function public.get_weekly_route_plan(text, date) to anon, authenticated;

-- 8. Aktualizacja admin_upsert_weekly_route_assignment: zabezpieczenie przed przypisaniem zarchiwizowanego usera
create or replace function public.admin_upsert_weekly_route_assignment(
  p_session_token text,
  p_route_id integer,
  p_trip_date date,
  p_driver_id uuid,
  p_car text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver record;
  v_assignment public.driver_route_plan_assignments;
  v_car text := nullif(trim(coalesce(p_car, '')), '');
  v_conflicting_driver_name text;
begin
  perform public.require_admin(p_session_token);
  if p_route_id is null or not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if p_trip_date is null or p_driver_id is null then
    return json_build_object('error', 'Wybierz dzień i kierowcę');
  end if;

  select id, name into v_driver
  from public.users
  where id = p_driver_id and role in ('admin', 'admin_viewer_driver', 'driver')
    and coalesce(is_archived, false) = false;
  if v_driver.id is null then
    return json_build_object('error', 'Kierowca nie istnieje lub jego konto jest zablokowane');
  end if;

  if v_car is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_trip_date::text || '|' || lower(v_car), 0)
    );

    select assignment.driver_name
    into v_conflicting_driver_name
    from public.driver_route_plan_assignments assignment
    where assignment.plan_date = p_trip_date
      and lower(assignment.car) = lower(v_car)
      and assignment.driver_id is distinct from p_driver_id
      and assignment.route_id is distinct from p_route_id
    limit 1;

    if v_conflicting_driver_name is not null then
      return json_build_object(
        'error',
        format('Auto %s jest już przypisane kierowcy %s w tym dniu', v_car, v_conflicting_driver_name)
      );
    end if;
  end if;

  insert into public.driver_route_plan_assignments (
    route_id,
    plan_date,
    driver_id,
    driver_name,
    car,
    planned_start
  ) values (
    p_route_id,
    p_trip_date,
    v_driver.id,
    v_driver.name,
    v_car,
    p_planned_start
  )
  on conflict (route_id, plan_date) do update
  set driver_id = excluded.driver_id,
      driver_name = excluded.driver_name,
      car = excluded.car,
      planned_start = excluded.planned_start,
      updated_at = now()
  returning * into v_assignment;

  return json_build_object('ok', true, 'assignment', row_to_json(v_assignment));
end;
$$;

grant execute on function public.admin_upsert_weekly_route_assignment(text, integer, date, uuid, text, timestamptz) to anon, authenticated;

-- 9. Aktualizacja admin_plan_driver_trip: blokada planowania dla zarchiwizowanego usera
create or replace function public.admin_plan_driver_trip(
  p_session_token text,
  p_driver_id uuid,
  p_trip_date date,
  p_car text default null,
  p_routes text default null,
  p_extra_clients text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_driver_id uuid;
  v_driver_name text;
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;

  if p_trip_date is null then
    return json_build_object('error', 'Brak daty trasy');
  end if;

  if p_driver_id is not null then
    select id, name into v_driver_id, v_driver_name
    from public.users
    where id = p_driver_id
      and role in ('admin', 'driver')
      and coalesce(is_archived, false) = false;

    if v_driver_id is null then
      return json_build_object('error', 'Nie znaleziono kierowcy lub jego konto zostało zablokowane');
    end if;
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients,
    planned_start, started_at, planning_source, planned_by_user_id, planned_by_name
  ) values (
    v_driver_id, v_driver_name, p_trip_date,
    trim(coalesce(p_car, '')), coalesce(p_routes, ''), 'planned', p_extra_clients,
    p_planned_start, null, 'dispatcher', v_admin.id, v_admin.name
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text, timestamptz) to anon, authenticated;

commit;
