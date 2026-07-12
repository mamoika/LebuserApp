-- Dzień operacyjny: sobota i niedziela traktowane jak poprzedni piątek.
-- Dotyczy logiki tras/kursów; rzeczywiste daty logów i historii bez zmian.

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

revoke execute on function public.lebuser_operational_date(timestamptz) from public, anon, authenticated;

-- driver_start_trip: domyślna data kursu = dzień operacyjny
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
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  if v_car <> '' and exists (
    select 1 from public.driver_trips
    where status = 'active'
      and car = v_car
      and driver_id is distinct from v_user.id
  ) then
    return json_build_object('error', 'To auto jest już na trasie u innego kierowcy');
  end if;

  if p_planned_trip_id is not null then
    select * into v_trip from public.driver_trips where id = p_planned_trip_id;
    if v_trip.id is null then
      return json_build_object('error', 'Nie znaleziono zaplanowanej trasy');
    end if;
    if v_trip.status <> 'planned' then
      return json_build_object('error', 'Ta trasa nie jest zaplanowana');
    end if;
    if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then
      return json_build_object('error', 'To nie Twoja trasa');
    end if;

    update public.driver_trips
    set car = coalesce(nullif(v_car, ''), car),
        routes = coalesce(nullif(p_routes, ''), routes),
        status = 'active',
        started_at = now(),
        driver_id = coalesce(driver_id, v_user.id),
        driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
    if exists (
      select 1 from public.driver_trips
      where driver_id = v_user.id
        and trip_date = v_trip_date
        and status = 'active'
    ) then
      return json_build_object('error', 'Masz już aktywną trasę');
    end if;

    select * into v_trip
    from public.driver_trips
    where driver_id = v_user.id
      and status = 'planned'
    order by
      (trip_date = v_trip_date) desc,
      trip_date desc,
      id desc
    limit 1;

    if v_trip.id is not null then
      return json_build_object('ok', true, 'trip', row_to_json(v_trip));
    end if;

    insert into public.driver_trips (
      driver_id,
      driver_name,
      trip_date,
      car,
      routes,
      status,
      started_at
    )
    values (
      v_user.id,
      v_user.name,
      v_trip_date,
      v_car,
      coalesce(p_routes, ''),
      'planned',
      null
    )
    returning * into v_trip;
  end if;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

-- Tablica dyspozytorni: domyślny dzień = operacyjny
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
  v_date date := coalesce(p_trip_date, public.lebuser_operational_date());
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

-- Aktywny kurs kierowcy: planowany na dziś = dzień operacyjny
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

-- Zdarzenia wpisów: przypisanie do kursu z dnia operacyjnego
create or replace function public.trip_capture_entry_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_stop public.trip_stops;
  v_actor_id uuid;
  v_actor_name text;
  v_event_type text;
begin
  if old.done is not distinct from new.done and old.delivered is not distinct from new.delivered then
    return new;
  end if;

  if old.delivered is distinct from new.delivered then
    v_actor_name := coalesce(new.delivered_by, old.delivered_by);
    v_event_type := case when new.delivered then 'delivery_completed' else 'delivery_reopened' end;
  else
    v_actor_name := coalesce(new.picked_by, old.picked_by);
    v_event_type := case when new.done then 'laundry_pickup_completed' else 'laundry_pickup_reopened' end;
  end if;

  select u.id into v_actor_id from public.users u where u.name = v_actor_name order by u.created_at limit 1;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.driver_name = v_actor_name
    and dt.trip_date = public.lebuser_operational_date()
    and dt.status in ('active', 'finished')
    and private.trip_includes_client(dt.routes, dt.extra_clients, new.route_id, new.client_name)
  order by (dt.status = 'active') desc, dt.started_at desc
  limit 1;

  if v_trip.id is null then return new; end if;
  perform private.sync_trip_course(v_trip.id);
  select * into v_stop from public.trip_stops where trip_id = v_trip.id and client_name = new.client_name;
  if v_stop.id is null then return new; end if;

  update public.trip_stop_tasks
  set status = case
        when task_type = 'pickup_clean' then case when new.done then 'completed' else 'pending' end
        when task_type = 'deliver_clean' then case when new.delivered then 'completed' else 'pending' end
        else status
      end,
      completed_at = case
        when task_type = 'pickup_clean' and new.done then coalesce(
          case when new.picked_at ~ '^\d{4}-\d{2}-\d{2}' then new.picked_at::timestamptz else null end,
          now()
        )
        when task_type = 'deliver_clean' and new.delivered then coalesce(new.delivered_at, now())
        when task_type in ('pickup_clean', 'deliver_clean') then null
        else completed_at
      end,
      updated_at = now()
  where stop_id = v_stop.id and entry_id = new.id;

  insert into public.trip_events (trip_id, stop_id, event_type, actor_user_id, actor_name, details, data)
  values (
    v_trip.id, v_stop.id, v_event_type, v_actor_id, v_actor_name,
    case
      when v_event_type = 'delivery_completed' then 'Dostarczono czyste pranie'
      when v_event_type = 'delivery_reopened' then 'Cofnięto dostawę'
      when v_event_type = 'laundry_pickup_completed' then 'Odebrano czyste pranie z pralni'
      else 'Cofnięto odbiór z pralni'
    end,
    jsonb_build_object('entry_id', new.id, 'client_name', new.client_name, 'weight', new.weight)
  );
  return new;
end;
$$;

-- Notatka klienta: tylko przy aktywnej trasie z dnia operacyjnego
create or replace function public.driver_set_client_note(
  p_session_token text,
  p_name text,
  p_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  if not exists (
    select 1 from public.driver_trips
    where driver_id = v_driver.id
      and trip_date = public.lebuser_operational_date()
      and status = 'active'
  ) then
    return json_build_object('error', 'Notatkę można zapisać tylko podczas aktywnej trasy');
  end if;

  update public.clients set note = nullif(p_note, '') where name = p_name;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.get_dispatch_board(text, date) to anon, authenticated;
