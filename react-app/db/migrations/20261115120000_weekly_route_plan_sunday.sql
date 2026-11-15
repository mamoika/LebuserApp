-- Plan tras: tydzień poniedziałek–niedziela (wcześniej poniedziałek–sobota).
-- Kierowca może kiedyś pojechać w niedzielę, więc plan pobiera i kopiuje 7 dni.
-- Zmiany względem poprzednich definicji:
--   get_weekly_route_plan        (z user_archival_and_availability_filtering.sql):
--     zakres dni v_start + 6 -> v_start + 7, generate_series do v_start + 6,
--     domyślna dostępność 'W' także w niedzielę (isodow in (6, 7)).
--   admin_copy_weekly_route_plan (z informational_driver_route_plan.sql):
--     kopiuje 7 dni zamiast 6.
-- `create or replace` zachowuje dotychczasowe uprawnienia (grant execute).

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
      where plan_date >= v_start and plan_date < v_start + 7
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
            case when extract(isodow from day_value) in (6, 7) then 'W' else 'I' end
          )
        end as value
      from public.users app_user
      cross join generate_series(v_start, v_start + 6, interval '1 day') as day_value
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
        and plan_date >= v_start and plan_date < v_start + 7
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
    where plan_date >= v_target and plan_date < v_target + 7
  ) then
    return json_build_object('error', 'Docelowy tydzień ma już zaplanowane trasy');
  end if;
  insert into public.driver_route_plan_assignments (
    plan_date, route_id, driver_id, driver_name, car, planned_start
  )
  select plan_date + (v_target - v_source), route_id, driver_id, driver_name, car,
    case when planned_start is null then null else planned_start + (v_target - v_source) end
  from public.driver_route_plan_assignments
  where plan_date >= v_source and plan_date < v_source + 7;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'copied', v_count);
end;
$$;
