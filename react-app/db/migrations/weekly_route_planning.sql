-- Tygodniowy plan tras.
-- driver_trips pozostaje pojedynczym, dziennym kursem. Ten moduł jedynie
-- planuje i publikuje kursy z wyprzedzeniem, bez tworzenia drugiej historii tras.

begin;

alter table public.driver_trips
  add column if not exists plan_published_at timestamptz,
  add column if not exists plan_published_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists plan_published_by_name text;

create index if not exists driver_trips_weekly_plan_idx
  on public.driver_trips (trip_date, driver_id)
  where status in ('planned', 'active', 'finished', 'handover');

create or replace function private.weekly_route_ids(p_routes text)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array(
      select value::integer
      from unnest(string_to_array(coalesce(nullif(trim(p_routes), ''), ''), ',')) as value
      where trim(value) ~ '^[0-9]+$'
      order by value::integer
    ),
    '{}'::integer[]
  );
$$;

create or replace function public.get_weekly_route_plan(
  p_session_token text,
  p_week_start date
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_start date;
  v_trips json;
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
    into v_trips
    from (
      select id, driver_id, driver_name, trip_date, car, routes, status,
             extra_clients, planned_start, started_at, ended_at, plan_published_at
      from public.driver_trips
      where trip_date >= v_start and trip_date < v_start + 6
        and status in ('planned', 'active', 'finished', 'handover')
        and cardinality(private.weekly_route_ids(routes)) > 0
    ) x;

    select coalesce(json_agg(row_to_json(x) order by x.name), '[]'::json)
    into v_drivers
    from (
      select id, name, role
      from public.users
      where role in ('admin', 'admin_viewer_driver', 'driver')
      order by name
    ) x;

    select coalesce(json_agg(row_to_json(x) order by x.driver_id, x.work_date), '[]'::json)
    into v_availability
    from (
      select
        u.id as driver_id,
        day_value::date as work_date,
        case
          when u.employee_id is null then null
          else coalesce(
            s.value,
            case when extract(isodow from day_value) = 6 then 'W' else 'I' end
          )
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
    into v_trips
    from (
      select id, driver_id, driver_name, trip_date, car, routes, status,
             planned_start, started_at, ended_at, plan_published_at
      from public.driver_trips
      where driver_id = v_user.id
        and trip_date >= v_start and trip_date < v_start + 6
        and status in ('planned', 'active', 'finished', 'handover')
        and cardinality(private.weekly_route_ids(routes)) > 0
        and (plan_published_at is not null or status <> 'planned')
    ) x;
  end if;

  return json_build_object(
    'ok', true,
    'week_start', v_start,
    'trips', v_trips,
    'drivers', v_drivers,
    'availability', v_availability
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
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_existing public.driver_trips;
  v_target public.driver_trips;
  v_routes integer[];
  v_next_routes integer[];
  v_schedule_value text;
begin
  perform public.require_admin(p_session_token);

  if p_route_id is null or not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if p_trip_date is null or p_driver_id is null then
    return json_build_object('error', 'Wybierz dzień i kierowcę');
  end if;

  select id, name, role, employee_id into v_driver
  from public.users
  where id = p_driver_id and role in ('admin', 'admin_viewer_driver', 'driver');
  if v_driver.id is null then return json_build_object('error', 'Nie znaleziono kierowcy'); end if;

  if v_driver.employee_id is not null then
    select value into v_schedule_value
    from public.schedule_entries
    where employee_id = v_driver.employee_id
      and year = extract(year from p_trip_date)::integer
      and month = extract(month from p_trip_date)::integer
      and day = extract(day from p_trip_date)::integer;
    v_schedule_value := coalesce(
      upper(trim(v_schedule_value)),
      case when extract(isodow from p_trip_date) = 6 then 'W' else 'I' end
    );
    if v_schedule_value in ('W', 'UW', 'L4', 'NU', 'NN', 'END') then
      return json_build_object('error', 'Kierowca jest niedostępny w grafiku na ten dzień');
    end if;
  end if;

  -- Blokujemy plan tego dnia, żeby ta sama trasa nie mogła trafić do dwóch osób.
  perform 1 from public.driver_trips
  where trip_date = p_trip_date and status = 'planned'
  for update;

  select * into v_existing
  from public.driver_trips
  where trip_date = p_trip_date
    and p_route_id = any(private.weekly_route_ids(routes))
  order by case status when 'planned' then 0 else 1 end
  limit 1;

  if v_existing.id is not null and v_existing.status <> 'planned' then
    return json_build_object('error', 'Rozpoczętego lub zakończonego kursu nie można zmienić w planie');
  end if;

  select * into v_target
  from public.driver_trips
  where driver_id = p_driver_id and trip_date = p_trip_date and status = 'planned'
  order by planned_start nulls last, id
  limit 1;

  if v_existing.id is not null and v_existing.id is distinct from v_target.id then
    v_next_routes := array_remove(private.weekly_route_ids(v_existing.routes), p_route_id);
    if cardinality(v_next_routes) = 0 then
      if exists (select 1 from public.trip_stops where trip_id = v_existing.id)
         or exists (select 1 from public.trip_events where trip_id = v_existing.id) then
        return json_build_object('error', 'Ten kurs jest już przygotowywany i nie można usunąć z niego ostatniej trasy');
      end if;
      delete from public.driver_trips where id = v_existing.id;
    else
      update public.driver_trips
      set routes = array_to_string(v_next_routes, ','),
          plan_published_at = null,
          plan_published_by_user_id = null,
          plan_published_by_name = null
      where id = v_existing.id;
    end if;
  end if;

  if v_target.id is null then
    insert into public.driver_trips (
      driver_id, driver_name, trip_date, car, routes, status, planned_start, plan_published_at
    ) values (
      v_driver.id, v_driver.name, p_trip_date, trim(coalesce(p_car, '')), p_route_id::text,
      'planned', p_planned_start, null
    ) returning * into v_target;
  else
    v_routes := private.weekly_route_ids(v_target.routes);
    if not p_route_id = any(v_routes) then v_routes := array_append(v_routes, p_route_id); end if;
    update public.driver_trips
    set routes = array_to_string(v_routes, ','),
        car = coalesce(nullif(trim(coalesce(p_car, '')), ''), car),
        planned_start = coalesce(p_planned_start, planned_start),
        plan_published_at = null,
        plan_published_by_user_id = null,
        plan_published_by_name = null
    where id = v_target.id
    returning * into v_target;
  end if;

  return json_build_object('ok', true, 'trip', row_to_json(v_target));
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
set search_path = public, private
as $$
declare
  v_trip public.driver_trips;
  v_routes integer[];
begin
  perform public.require_admin(p_session_token);
  select * into v_trip
  from public.driver_trips
  where trip_date = p_trip_date and status = 'planned'
    and p_route_id = any(private.weekly_route_ids(routes))
  for update;
  if v_trip.id is null then return json_build_object('ok', true, 'removed', false); end if;

  v_routes := array_remove(private.weekly_route_ids(v_trip.routes), p_route_id);
  if cardinality(v_routes) = 0 then
    if exists (select 1 from public.trip_stops where trip_id = v_trip.id)
       or exists (select 1 from public.trip_events where trip_id = v_trip.id) then
      return json_build_object('error', 'Ten kurs jest już przygotowywany i nie można usunąć przypisania');
    end if;
    delete from public.driver_trips where id = v_trip.id;
  else
    update public.driver_trips
    set routes = array_to_string(v_routes, ','),
        plan_published_at = null,
        plan_published_by_user_id = null,
        plan_published_by_name = null
    where id = v_trip.id;
  end if;
  return json_build_object('ok', true, 'removed', true);
end;
$$;

create or replace function public.admin_publish_weekly_route_plan(
  p_session_token text,
  p_week_start date
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin record;
  v_start date;
  v_count integer;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  v_start := date_trunc('week', coalesce(p_week_start, (now() at time zone 'Europe/Warsaw')::date))::date;

  update public.driver_trips
  set plan_published_at = now(),
      plan_published_by_user_id = v_admin.id,
      plan_published_by_name = v_admin.name
  where trip_date >= v_start and trip_date < v_start + 6
    and status = 'planned'
    and cardinality(private.weekly_route_ids(routes)) > 0;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'published', v_count);
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
set search_path = public, private
as $$
declare
  v_source date;
  v_target date;
  v_count integer;
begin
  perform public.require_admin(p_session_token);
  v_source := date_trunc('week', p_source_week_start)::date;
  v_target := date_trunc('week', p_target_week_start)::date;
  if v_source = v_target then return json_build_object('error', 'Wybierz inny tydzień źródłowy'); end if;
  if exists (
    select 1 from public.driver_trips
    where trip_date >= v_target and trip_date < v_target + 6
      and status in ('planned', 'active', 'finished', 'handover')
      and cardinality(private.weekly_route_ids(routes)) > 0
  ) then
    return json_build_object('error', 'Docelowy tydzień ma już zaplanowane trasy');
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients, planned_start
  )
  select driver_id, driver_name, trip_date + (v_target - v_source), car, routes,
         'planned', extra_clients,
         case when planned_start is null then null else planned_start + (v_target - v_source) end
  from public.driver_trips
  where trip_date >= v_source and trip_date < v_source + 6
    and status = 'planned'
    and cardinality(private.weekly_route_ids(routes)) > 0;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'copied', v_count);
end;
$$;

grant execute on function public.get_weekly_route_plan(text, date) to anon, authenticated;
grant execute on function public.admin_upsert_weekly_route_assignment(text, integer, date, uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_remove_weekly_route_assignment(text, integer, date) to anon, authenticated;
grant execute on function public.admin_publish_weekly_route_plan(text, date) to anon, authenticated;
grant execute on function public.admin_copy_weekly_route_plan(text, date, date) to anon, authenticated;

commit;
