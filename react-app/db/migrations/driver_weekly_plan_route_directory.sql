-- Dodaje pełny, tylko informacyjny katalog tras i klientów do odpowiedzi
-- tygodniowego planu. Nie zmienia get_app_data, driver_trips ani operacyjnych
-- uprawnień kierowcy w pozostałych modułach aplikacji.

begin;

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

  -- Katalog służy tylko do prezentacji na stronie „Klienci i Trasy”.
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

commit;
