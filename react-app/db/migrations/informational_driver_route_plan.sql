-- Niezależny, wyłącznie informacyjny plan tras dla kierowców.
-- Ten moduł nie tworzy kursów, nie zmienia driver_trips i nie nadaje dostępu
-- do klientów, tras ani wpisów w pozostałej części aplikacji.

create table if not exists public.driver_route_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  route_id integer not null references public.routes(id) on delete cascade,
  driver_id uuid references public.users(id) on delete set null,
  driver_name text not null,
  car text,
  planned_start timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_date, route_id)
);

create index if not exists driver_route_plan_assignments_driver_date_idx
  on public.driver_route_plan_assignments (driver_id, plan_date);

revoke all on table public.driver_route_plan_assignments from public, anon, authenticated;

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

  v_start := date_trunc('week', coalesce(p_week_start, (now() at time zone 'Europe/Warsaw')::date))::date;

  if v_user.role in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    select coalesce(json_agg(row_to_json(x) order by x.trip_date, x.driver_name), '[]'::json)
    into v_assignments
    from (
      select id, driver_id, driver_name, plan_date as trip_date, car,
             route_id::text as routes, planned_start, 'informational'::text as status
      from public.driver_route_plan_assignments
      where plan_date >= v_start and plan_date < v_start + 6
    ) x;

    select coalesce(json_agg(row_to_json(x) order by x.name), '[]'::json)
    into v_drivers
    from (
      select id, name, role
      from public.users
      where role in ('admin', 'admin_viewer_driver', 'driver')
      order by name
    ) x;

    select coalesce(json_agg(row_to_json(x) order by x.sort_order), '[]'::json)
    into v_routes
    from (select id, name, sort_order from public.routes) x;

    select coalesce(json_agg(row_to_json(x) order by x.driver_id, x.work_date), '[]'::json)
    into v_availability
    from (
      select u.id as driver_id, day_value::date as work_date,
        case
          when u.employee_id is null then null
          else coalesce(s.value, case when extract(isodow from day_value) = 6 then 'W' else 'I' end)
        end as value
      from public.users u
      cross join generate_series(v_start, v_start + 5, interval '1 day') as day_value
      left join public.schedule_entries s
        on s.employee_id = u.employee_id
       and s.year = extract(year from day_value)::integer
       and s.month = extract(month from day_value)::integer
       and s.day = extract(day from day_value)::integer
      where u.role in ('admin', 'admin_viewer_driver', 'driver')
    ) x;

  else
    select coalesce(json_agg(row_to_json(x) order by x.trip_date), '[]'::json)
    into v_assignments
    from (
      select id, driver_id, driver_name, plan_date as trip_date, car,
             route_id::text as routes, planned_start, 'informational'::text as status
      from public.driver_route_plan_assignments
      where driver_id = v_user.id
        and plan_date >= v_start and plan_date < v_start + 6
    ) x;

    select coalesce(json_agg(row_to_json(x) order by x.sort_order), '[]'::json)
    into v_routes
    from (
      select distinct r.id, r.name, r.sort_order
      from public.routes r
      join public.driver_route_plan_assignments assignment on assignment.route_id = r.id
      where assignment.driver_id = v_user.id
        and assignment.plan_date >= v_start and assignment.plan_date < v_start + 6
    ) x;
  end if;

  return json_build_object(
    'ok', true, 'week_start', v_start, 'trips', v_assignments, 'routes', v_routes,
    'drivers', v_drivers, 'availability', v_availability
  );
end;
$$;

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
begin
  perform public.require_admin(p_session_token);
  if p_route_id is null or not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if p_trip_date is null or p_driver_id is null then
    return json_build_object('error', 'Wybierz dzień i kierowcę');
  end if;
  select id, name into v_driver from public.users
  where id = p_driver_id and role in ('admin', 'admin_viewer_driver', 'driver');
  if v_driver.id is null then return json_build_object('error', 'Nie znaleziono kierowcy'); end if;

  insert into public.driver_route_plan_assignments (
    plan_date, route_id, driver_id, driver_name, car, planned_start, updated_at
  ) values (
    p_trip_date, p_route_id, v_driver.id, v_driver.name,
    nullif(trim(coalesce(p_car, '')), ''), p_planned_start, now()
  )
  on conflict (plan_date, route_id) do update
  set driver_id = excluded.driver_id,
      driver_name = excluded.driver_name,
      car = excluded.car,
      planned_start = excluded.planned_start,
      updated_at = now()
  returning * into v_assignment;

  return json_build_object(
    'ok', true,
    'assignment', json_build_object(
      'id', v_assignment.id, 'driver_id', v_assignment.driver_id,
      'driver_name', v_assignment.driver_name, 'trip_date', v_assignment.plan_date,
      'routes', v_assignment.route_id::text, 'car', v_assignment.car,
      'planned_start', v_assignment.planned_start, 'status', 'informational'
    )
  );
end;
$$;

create or replace function public.admin_remove_weekly_route_assignment(
  p_session_token text,
  p_route_id integer,
  p_trip_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.require_admin(p_session_token);
  delete from public.driver_route_plan_assignments
  where route_id = p_route_id and plan_date = p_trip_date;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'removed', v_count > 0);
end;
$$;

create or replace function public.admin_copy_weekly_route_plan(
  p_session_token text,
  p_source_week_start date,
  p_target_week_start date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source date := date_trunc('week', p_source_week_start)::date;
  v_target date := date_trunc('week', p_target_week_start)::date;
  v_count integer;
begin
  perform public.require_admin(p_session_token);
  if v_source = v_target then return json_build_object('error', 'Wybierz inny tydzień źródłowy'); end if;
  if exists (
    select 1 from public.driver_route_plan_assignments
    where plan_date >= v_target and plan_date < v_target + 6
  ) then
    return json_build_object('error', 'Docelowy tydzień ma już zaplanowane trasy');
  end if;
  insert into public.driver_route_plan_assignments (
    plan_date, route_id, driver_id, driver_name, car, planned_start
  )
  select plan_date + (v_target - v_source), route_id, driver_id, driver_name, car,
    case when planned_start is null then null else planned_start + (v_target - v_source) end
  from public.driver_route_plan_assignments
  where plan_date >= v_source and plan_date < v_source + 6;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'copied', v_count);
end;
$$;

-- Zachowujemy kompatybilność z wcześniejszym frontendem. Publikacja nie ma
-- żadnego wpływu na kursy, dostęp ani statusy — plan jest widoczny od zapisu.
create or replace function public.admin_publish_weekly_route_plan(
  p_session_token text,
  p_week_start date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);
  return json_build_object('ok', true, 'published', 0);
end;
$$;

grant execute on function public.get_weekly_route_plan(text, date) to anon, authenticated;
grant execute on function public.admin_upsert_weekly_route_assignment(text, integer, date, uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_remove_weekly_route_assignment(text, integer, date) to anon, authenticated;
grant execute on function public.admin_copy_weekly_route_plan(text, date, date) to anon, authenticated;
grant execute on function public.admin_publish_weekly_route_plan(text, date) to anon, authenticated;

-- Przywrócenie wcześniejszego, operacyjnego startu kursu. Plan informacyjny
-- powyżej nie bierze udziału w tej funkcji.
create or replace function public.driver_start_trip(
  p_session_token text,
  p_planned_trip_id uuid default null,
  p_trip_date date default null,
  p_car text default null,
  p_routes text default ''
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_car text := trim(coalesce(p_car, ''));
  v_trip_date date := coalesce(p_trip_date, public.lebuser_operational_date());
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;
  if v_car <> '' and exists (
    select 1 from public.driver_trips
    where status = 'active' and car = v_car and driver_id is distinct from v_user.id
  ) then return json_build_object('error', 'To auto jest już na trasie u innego kierowcy'); end if;

  if p_planned_trip_id is not null then
    select * into v_trip from public.driver_trips where id = p_planned_trip_id;
    if v_trip.id is null then return json_build_object('error', 'Nie znaleziono zaplanowanej trasy'); end if;
    if v_trip.status <> 'planned' then return json_build_object('error', 'Ta trasa nie jest zaplanowana'); end if;
    if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twoja trasa'); end if;
    update public.driver_trips
    set car = coalesce(nullif(v_car, ''), car),
        routes = coalesce(nullif(p_routes, ''), routes),
        status = 'active', started_at = now(),
        driver_id = coalesce(driver_id, v_user.id), driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
    if exists (
      select 1 from public.driver_trips
      where driver_id = v_user.id and trip_date = v_trip_date and status = 'active'
    ) then return json_build_object('error', 'Masz już aktywną trasę'); end if;
    select * into v_trip from public.driver_trips
    where driver_id = v_user.id and status = 'planned'
    order by (trip_date = v_trip_date) desc, trip_date desc, id desc limit 1;
    if v_trip.id is not null then return json_build_object('ok', true, 'trip', row_to_json(v_trip)); end if;
    insert into public.driver_trips (driver_id, driver_name, trip_date, car, routes, status, started_at)
    values (v_user.id, v_user.name, v_trip_date, v_car, coalesce(p_routes, ''), 'planned', null)
    returning * into v_trip;
  end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

-- Przywrócenie istniejących filtrów danych operacyjnych. Są one niezależne
-- od public.driver_route_plan_assignments.
create or replace function public.get_app_data(
  p_session_token text,
  p_last_week_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_last_week_key text := coalesce(nullif(trim(coalesce(p_last_week_key, '')), ''), to_char((date_trunc('week', now())::date - 7), 'YYYY-MM-DD'));
  v_route_ids integer[] := array[]::integer[];
  v_trip_route_ids integer[] := array[]::integer[];
  v_extra_client_names text[] := array[]::text[];
  v_visible_route_ids integer[] := array[]::integer[];
  v_visible_client_names text[] := array[]::text[];
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role = 'driver' then
    v_route_ids := array(
      select distinct trim(x)::integer from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where trim(x) ~ '^[0-9]+$'
    );
    v_trip_route_ids := array(
      select distinct trim(x)::integer
      from public.driver_trips dt cross join lateral regexp_split_to_table(coalesce(dt.routes, ''), ',') as x
      where (dt.driver_id = v_user.id or dt.status = 'handover')
        and dt.status in ('planned', 'active', 'handover') and trim(x) ~ '^[0-9]+$'
    );
    v_extra_client_names := array(
      select distinct trim(x)
      from public.driver_trips dt cross join lateral unnest(public.lebuser_text_jsonb_array(dt.extra_clients)) as x
      where (dt.driver_id = v_user.id or dt.status = 'handover')
        and dt.status in ('planned', 'active', 'handover') and nullif(trim(x), '') is not null
    );
    v_visible_route_ids := array(
      select distinct route_id from (
        select unnest(v_route_ids) as route_id
        union select unnest(v_trip_route_ids) as route_id
        union select c.route_id from public.clients c where c.name = any(v_extra_client_names)
      ) visible_routes where route_id is not null
    );
    v_visible_client_names := array(
      select distinct c.name from public.clients c
      where c.route_id = any(v_visible_route_ids) or c.name = any(v_extra_client_names)
    );
    select coalesce(json_agg(row_to_json(client_row)), '[]'::json) into v_clients
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
        and client.name = any(v_visible_client_names)
      order by client.sort_order
    ) client_row;
    select coalesce(json_agg(row_to_json(route_row)), '[]'::json) into v_routes
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
      where route.id = any(v_visible_route_ids)
      order by route.sort_order
    ) route_row;
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_entries
    from (
      select * from public.entries
      where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
        and (route_id = any(v_visible_route_ids) or client_name = any(v_visible_client_names)
          or picked_by = v_user.name or delivered_by = v_user.name or added_by = v_user.name)
    ) x;
    if to_regclass('public.laundry_receipts') is not null then
      select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_receipts
      from (select * from public.laundry_receipts where deleted_at is null and client_name = any(v_visible_client_names) order by doc_no desc) x;
    end if;
  else
    select coalesce(json_agg(row_to_json(client_row)), '[]'::json) into v_clients
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
      order by client.sort_order
    ) client_row;
    select coalesce(json_agg(row_to_json(route_row)), '[]'::json) into v_routes
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
      order by route.sort_order
    ) route_row;
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_entries from (
      select * from public.entries where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
    ) x;
    if to_regclass('public.laundry_receipts') is not null then
      execute 'select coalesce(json_agg(row_to_json(x)), ''[]''::json) from (select * from public.laundry_receipts where deleted_at is null order by doc_no desc) x' into v_receipts;
    end if;
  end if;
  return json_build_object('ok', true, 'clients', v_clients, 'routes', v_routes, 'entries', v_entries, 'receipts', v_receipts);
end;
$$;

grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.get_app_data(text, text) to anon, authenticated;

create or replace function public.get_history_entries(
  p_session_token text,
  p_limit integer default 1500
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_limit integer := least(greatest(coalesce(p_limit, 1500), 1), 2000);
  v_route_ids integer[];
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role in ('driver', 'admin_viewer_driver') then
    v_route_ids := array(
      select trim(x)::integer from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where trim(x) ~ '^[0-9]+$'
    );
    if coalesce(array_length(v_route_ids, 1), 0) = 0 then
      return json_build_object('ok', true, 'entries', '[]'::json);
    end if;
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
    from (select * from public.entries where route_id = any(v_route_ids) order by added_at desc limit v_limit) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
    from (select * from public.entries order by added_at desc limit v_limit) x;
  end if;
  return json_build_object('ok', true, 'entries', v_rows);
end;
$$;

create or replace function public.get_entry_logs(p_session_token text, p_entry_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_entry record;
  v_route_ids integer[];
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if nullif(trim(coalesce(p_entry_id, '')), '') is null then return json_build_object('error', 'Brak id wpisu'); end if;
  select id, route_id into v_entry from public.entries where id = p_entry_id limit 1;
  if v_entry.id is null then return json_build_object('error', 'Nie znaleziono wpisu'); end if;
  if v_user.role not in ('admin', 'admin_viewer') then
    v_route_ids := array(
      select nullif(trim(x), '')::integer from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where nullif(trim(x), '') is not null
    );
    if v_entry.route_id is null or not (v_entry.route_id = any(v_route_ids)) then
      raise exception 'Entry access denied' using errcode = '42501';
    end if;
  end if;
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
  from (
    select id, user_name, actor_user_id, actor_role, action, category,
      client_name, entry_id, entity_type, entity_id, details, metadata,
      session_id, device_label, created_at
    from public.logs where entry_id = p_entry_id order by created_at asc
  ) x;
  return json_build_object('ok', true, 'logs', v_rows);
end;
$$;

grant execute on function public.get_history_entries(text, integer) to anon, authenticated;
grant execute on function public.get_entry_logs(text, text) to anon, authenticated;
