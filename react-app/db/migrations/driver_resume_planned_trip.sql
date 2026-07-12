-- Wznawianie kursu w fazie planowania: bez twardego dopasowania daty (weekend / drift).

create or replace function public.lebuser_operational_date(p_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select case extract(isodow from (coalesce(p_at, now()) at time zone 'Europe/Warsaw'))
    when 6 then ((coalesce(p_at, now()) at time zone 'Europe/Warsaw')::date - 1)
    when 7 then ((coalesce(p_at, now()) at time zone 'Europe/Warsaw')::date - 2)
    else (coalesce(p_at, now()) at time zone 'Europe/Warsaw')::date
  end;
$$;

create or replace function public.get_driver_course(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_stops json := '[]'::json;
  v_report json;
  v_employee json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver', 'admin_viewer_driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  select * into v_trip
  from public.driver_trips
  where driver_id = v_user.id
    and status = 'active'
  order by started_at desc nulls last, id desc
  limit 1;

  if v_trip.id is null then
    select * into v_trip
    from public.driver_trips
    where driver_id = v_user.id
      and status = 'planned'
    order by
      (trip_date = public.lebuser_operational_date()) desc,
      (trip_date = (now() at time zone 'Europe/Warsaw')::date) desc,
      trip_date desc,
      id desc
    limit 1;
  end if;

  if v_trip.id is null then
    return json_build_object('ok', true, 'trip', null, 'stops', '[]'::json);
  end if;

  perform private.sync_trip_course(v_trip.id);

  select coalesce(json_agg(row_to_json(stop_row) order by stop_row.position), '[]'::json)
  into v_stops
  from (
    select
      s.*,
      c.lat, c.lng,
      coalesce(receipt.address, '') as address,
      coalesce(tasks.items, '[]'::json) as tasks
    from public.trip_stops s
    left join public.clients c on c.id = s.client_id
    left join lateral (
      select lr.address from public.laundry_receipts lr
      where lr.client_name = s.client_name and lr.deleted_at is null and nullif(trim(coalesce(lr.address, '')), '') is not null
      order by lr.created_at desc limit 1
    ) receipt on true
    left join lateral (
      select json_agg(row_to_json(task_row) order by task_row.id) as items
      from (
        select task.*, e.done, e.delivered, e.picked_by, e.delivered_by,
               e.laundry_packed_at, e.laundry_ready_at, e.laundry_trolley_no, e.laundry_trolley_cycle_id
        from public.trip_stop_tasks task
        left join public.entries e on e.id = task.entry_id
        where task.stop_id = s.id
      ) task_row
    ) tasks on true
    where s.trip_id = v_trip.id
  ) stop_row;

  select row_to_json(r) into v_report
  from public.work_time_reports r where r.source_trip_id = v_trip.id order by r.reported_at desc limit 1;
  select row_to_json(e) into v_employee
  from (
    select emp.id, emp.name, emp.default_start, emp.default_end
    from public.users u join public.employees emp on emp.id = u.employee_id
    where u.id = v_trip.driver_id
  ) e;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip), 'stops', v_stops, 'work_time_report', v_report, 'employee', v_employee);
end;
$$;

create or replace function public.get_driver_trips_data(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trips json;
  v_costs json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver') then
    raise exception 'Driver data access required' using errcode = '42501';
  end if;

  if v_user.role in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_trips
    from (
      select *
      from public.driver_trips
      order by started_at desc nulls last, trip_date desc, id desc
      limit 60
    ) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_trips
    from (
      select *
      from public.driver_trips
      where driver_id = v_user.id
         or status in ('handover', 'active')
      order by started_at desc nulls last, trip_date desc, id desc
      limit 60
    ) x;
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_costs
  from (
    select entry_date, fiat_end, isuzu_end, merc_end, iveco_end
    from public.daily_costs
    order by entry_date desc
    limit 180
  ) x;

  return json_build_object(
    'ok', true,
    'trips', v_trips,
    'daily_costs', v_costs
  );
end;
$$;

grant execute on function public.get_driver_course(text) to anon, authenticated;
grant execute on function public.get_driver_trips_data(text) to anon, authenticated;
