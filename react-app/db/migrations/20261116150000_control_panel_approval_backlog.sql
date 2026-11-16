-- Panel sterujący ma osobną skrzynkę otwartych decyzji. Dzisiejsze KPI
-- pozostają dzienne, natomiast niezakończone rozliczenia i zgłoszenia czasu
-- nie znikają tylko dlatego, że pochodzą z wcześniejszego dnia lub miesiąca.

create or replace function public.get_control_panel_approval_backlog(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_trips json;
  v_work_time_reports json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(item) order by item.priority, item.trip_date, item.id), '[]'::json)
  into v_trips
  from (
    select
      trip.*,
      case when trip.status = 'planned' then 'planning' else 'settlement' end as board_status,
      case when trip.status = 'finished' then 1 else 2 end as priority,
      report.id as work_time_report_id,
      report.status as hours_status,
      to_char(report.reported_start, 'HH24:MI') as reported_start,
      to_char(report.reported_end, 'HH24:MI') as reported_end,
      report.reported_minutes,
      case when report.reported_start is not null
        then to_char(report.reported_start, 'HH24:MI') || '–' || to_char(report.reported_end, 'HH24:MI')
        else null end as reported_hours,
      route_info.route_name,
      route_info.route_display
    from public.driver_trips trip
    left join lateral (
      select work_report.*
      from public.work_time_reports work_report
      where work_report.source_trip_id = trip.id
      order by work_report.reported_at desc
      limit 1
    ) report on true
    left join lateral (
      select string_agg(route.name, ', ' order by route.sort_order) as route_name,
             min(numbered.display_no) as route_display
      from unnest(string_to_array(nullif(trip.routes, ''), ',')) route_id_text
      join public.routes route on route.id = trim(route_id_text)::integer
      join lateral (
        select (row_number() over (order by listed.sort_order))::integer as display_no, listed.id
        from public.routes listed
      ) numbered on numbered.id = route.id
    ) route_info on true
    where (
      trip.status = 'finished'
      and (
        (trip.end_km is not null and coalesce(trip.km_approval_status, 'pending') <> 'approved')
        or (report.id is not null and report.status <> 'approved')
      )
    ) or (
      trip.status = 'planned'
      and trip.driver_id is null
      and trip.trip_date >= public.lebuser_operational_date()
    )
  ) item;

  select coalesce(json_agg(row_to_json(item) order by item.work_date, item.employee_name), '[]'::json)
  into v_work_time_reports
  from (
    select report.*, employee.name as employee_name,
           coalesce(app_user.name, report.user_name) as user_name
    from public.work_time_reports report
    join public.employees employee on employee.id = report.employee_id
    left join public.users app_user on app_user.id = report.user_id
    where report.status = 'pending'
      and not exists (
        select 1
        from public.driver_trips trip
        where trip.id = report.source_trip_id
          and trip.status = 'finished'
      )
  ) item;

  return json_build_object(
    'ok', true,
    'trips', v_trips,
    'work_time_reports', v_work_time_reports
  );
end;
$$;

revoke all on function public.get_control_panel_approval_backlog(text) from public;
grant execute on function public.get_control_panel_approval_backlog(text) to anon, authenticated;
