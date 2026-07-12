-- Pola godzin pracy na tablicy dyspozytorni (zatwierdzanie bez przejścia do Grafiku).

create or replace function public.get_dispatch_board(
  p_session_token text,
  p_trip_date date default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_date date := coalesce(p_trip_date, (now() at time zone 'Europe/Warsaw')::date);
  v_trip record;
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  for v_trip in select id from public.driver_trips where trip_date = v_date loop
    perform private.sync_trip_course(v_trip.id);
  end loop;

  select coalesce(json_agg(row_to_json(board) order by board.started_at, board.id), '[]'::json)
  into v_rows
  from (
    select
      dt.*,
      case
        when dt.status = 'planned' and (dt.driver_id is null or nullif(trim(coalesce(dt.car, '')), '') is null) then 'planning'
        when dt.status = 'planned' then 'ready'
        when dt.status in ('active', 'handover') then 'active'
        when dt.status = 'finished'
          and dt.km_approval_status = 'approved'
          and coalesce(wtr.status, 'pending') = 'approved' then 'closed'
        else 'settlement'
      end as board_status,
      coalesce(stop_stats.stops_total, 0) as stops_total,
      coalesce(stop_stats.stops_completed, 0) as stops_completed,
      stop_stats.current_stop_name,
      route_info.route_name,
      route_info.route_display,
      wtr.id as work_time_report_id,
      wtr.status as hours_status,
      to_char(wtr.reported_start, 'HH24:MI') as reported_start,
      to_char(wtr.reported_end, 'HH24:MI') as reported_end,
      wtr.reported_minutes,
      emp.name as employee_name,
      case when wtr.reported_start is not null
        then to_char(wtr.reported_start, 'HH24:MI') || '–' || to_char(wtr.reported_end, 'HH24:MI')
        else null end as reported_hours,
      problem.details as problem_label,
      problem.created_at as problem_at
    from public.driver_trips dt
    left join lateral (
      select w.*
      from public.work_time_reports w
      where w.source_trip_id = dt.id
      order by w.reported_at desc
      limit 1
    ) wtr on true
    left join public.employees emp on emp.id = wtr.employee_id
    left join lateral (
      select count(*)::integer as stops_total,
             count(*) filter (where s.status in ('completed', 'skipped'))::integer as stops_completed,
             (array_agg(s.client_name order by (s.status = 'pending') desc, s.position)
                filter (where s.status = 'pending'))[1] as current_stop_name
      from public.trip_stops s where s.trip_id = dt.id
    ) stop_stats on true
    left join lateral (
      select string_agg(r.name, ', ' order by r.sort_order) as route_name,
             min(numbered.display_no) as route_display
      from unnest(string_to_array(nullif(dt.routes, ''), ',')) route_id_text
      join public.routes r on r.id = trim(route_id_text)::integer
      join lateral (
        select (row_number() over (order by rr.sort_order))::integer as display_no, rr.id
        from public.routes rr
      ) numbered on numbered.id = r.id
    ) route_info on true
    left join lateral (
      select ev.details, ev.created_at
      from public.trip_events ev
      where ev.trip_id = dt.id and ev.event_type in ('problem_reported', 'client_unavailable', 'partial_pickup')
      order by ev.created_at desc limit 1
    ) problem on true
    where dt.trip_date = v_date
  ) board;

  return json_build_object('ok', true, 'trip_date', v_date, 'trips', v_rows);
end;
$$;

grant execute on function public.get_dispatch_board(text, date) to anon, authenticated;
