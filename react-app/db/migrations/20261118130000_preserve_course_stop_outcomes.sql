-- Keep pre-departure exclusions and real skipped visits distinct in operational
-- counts. Finishing or reopening a course must not turn an exclusion into a
-- completed visit or turn an unconfirmed clean delivery into a completed task.
begin;

create or replace function private.sync_trip_course(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_max_position integer;
begin
  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return; end if;

  -- Puste punkty harmonogramu należą wyłącznie do planu dyspozytora.
  -- Usuwa to również błędnie wygenerowane punkty ze starszych kursów kierowcy.
  delete from public.trip_stops stop
  where stop.trip_id = v_trip.id
    and stop.stop_kind = 'scheduled'
    and stop.status = 'pending'
    and not exists (select 1 from public.trip_stop_tasks task where task.stop_id = stop.id)
    and (
      v_trip.planning_source is distinct from 'dispatcher'
      or stop.client_id is null
      or not private.client_service_is_due(stop.client_id, v_trip.trip_date)
      or not private.trip_includes_client(
        v_trip.routes, v_trip.extra_clients, stop.route_id, stop.client_name
      )
    );

  select coalesce(max(position), 0) into v_max_position
  from public.trip_stops where trip_id = p_trip_id;

  insert into public.trip_stops (
    trip_id, client_id, client_name, route_id, position, stop_kind, note
  )
  select
    v_trip.id,
    client.id,
    work.client_name,
    coalesce(client.route_id, work.route_id),
    v_max_position + row_number() over (
      order by coalesce(route.sort_order, 9999), coalesce(client.sort_order, 9999), work.client_name
    ),
    case
      when v_trip.extra_clients is not null
       and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
       and v_trip.extra_clients::jsonb ? work.client_name then 'extra'
      when work.scheduled_only then 'scheduled'
      else 'client'
    end,
    client.note
  from (
    select source.client_name, min(source.route_id) as route_id,
           bool_and(source.is_scheduled) as scheduled_only
    from (
      -- Rzeczywiste zadania/pranie są widoczne w obu rodzajach kursu.
      select entry.client_name, entry.route_id, false as is_scheduled
      from public.entries entry
      where entry.deleted_at is null
        and private.trip_includes_client(
          v_trip.routes, v_trip.extra_clients, entry.route_id, entry.client_name
        )
        and (
          public.lebuser_pickup_date(entry.week_key, entry.pick_week_key, entry.pick_day) = v_trip.trip_date
          or (
            public.lebuser_pickup_date(entry.week_key, entry.pick_week_key, entry.pick_day) < v_trip.trip_date
            and coalesce(entry.delivered, false) = false
          )
          or private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date
          or (
            entry.picked_by = v_trip.driver_name
            and entry.picked_at ~ '^\d{4}-\d{2}-\d{2}'
            and (entry.picked_at::timestamptz at time zone 'Europe/Warsaw')::date = v_trip.trip_date
          )
          or (
            entry.delivered_by = v_trip.driver_name
            and (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
          )
        )
      union all
      -- Cykliczny harmonogram klientów tworzy puste punkty tylko wtedy,
      -- gdy sam kurs został wcześniej przygotowany przez dyspozytora.
      select scheduled.name, scheduled.route_id, true
      from public.clients scheduled
      where v_trip.planning_source = 'dispatcher'
        and private.client_service_is_due(scheduled.id, v_trip.trip_date)
        and private.trip_includes_client(
          v_trip.routes, v_trip.extra_clients, scheduled.route_id, scheduled.name
        )
    ) source
    group by source.client_name
  ) work
  left join public.clients client on client.name = work.client_name
  left join public.routes route on route.id = coalesce(client.route_id, work.route_id)
  where not exists (
    select 1 from public.trip_stops existing
    where existing.trip_id = v_trip.id and existing.client_name = work.client_name
  );

  update public.trip_stops stop
  set client_id = coalesce(stop.client_id, client.id),
      route_id = coalesce(client.route_id, stop.route_id),
      note = client.note,
      updated_at = now()
  from public.clients client
  where stop.trip_id = v_trip.id and client.name = stop.client_name;

  insert into public.trip_stop_tasks (
    stop_id, entry_id, task_type, quantity, unit, status, metadata, completed_at
  )
  select stop.id, entry.id, task.task_type,
         case when task.task_type = 'pickup_dirty'
           then coalesce(entry.weight, entry.trolleys::numeric)
           else entry.weight
         end,
         case when entry.weight is not null then 'kg' else 'wózki' end,
         case
           when task.task_type = 'pickup_clean' and entry.done then 'completed'
           when task.task_type = 'deliver_clean' and entry.delivered then 'completed'
           else 'pending'
         end,
         jsonb_build_object(
           'entry_type', coalesce(entry.type, 'P'),
           'trolleys', coalesce(entry.trolleys, 1),
           'picked_baskets', entry.picked_baskets,
           'trolley_cycle_id', entry.laundry_trolley_cycle_id,
           'trolley_no', entry.laundry_trolley_no,
           'laundry_status', entry.laundry_status,
           'urgent', coalesce(entry.urgent, false)
         ),
         case
           when task.task_type = 'pickup_clean' and entry.done then coalesce(
             case when entry.picked_at ~ '^\d{4}-\d{2}-\d{2}'
               then entry.picked_at::timestamptz else null end,
             now()
           )
           when task.task_type = 'deliver_clean' and entry.delivered
             then coalesce(entry.delivered_at, now())
           else null
         end
  from public.trip_stops stop
  join public.entries entry
    on entry.client_name = stop.client_name and entry.deleted_at is null
  cross join lateral (
    select 'pickup_clean'::text as task_type
    where public.lebuser_pickup_date(
      entry.week_key, entry.pick_week_key, entry.pick_day
    ) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(
          entry.week_key, entry.pick_week_key, entry.pick_day
        ) = v_trip.trip_date
        or coalesce(entry.delivered, false) = false
        or (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'deliver_clean'::text
    where public.lebuser_pickup_date(
      entry.week_key, entry.pick_week_key, entry.pick_day
    ) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(
          entry.week_key, entry.pick_week_key, entry.pick_day
        ) = v_trip.trip_date
        or coalesce(entry.delivered, false) = false
        or (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'pickup_dirty'::text
    where private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date
  ) task
  where stop.trip_id = v_trip.id
    and stop.status <> 'skipped'
    and private.trip_includes_client(
      v_trip.routes, v_trip.extra_clients, entry.route_id, entry.client_name
    )
  on conflict (stop_id, entry_id, task_type) do update set
    quantity = excluded.quantity,
    unit = excluded.unit,
    status = excluded.status,
    metadata = excluded.metadata,
    completed_at = excluded.completed_at,
    updated_at = now();

  update public.trip_stops stop
  set status = 'completed',
      completed_at = coalesce(stop.completed_at, v_trip.ended_at, now()),
      completed_by_user_id = coalesce(stop.completed_by_user_id, v_trip.driver_id),
      completed_by_name = coalesce(stop.completed_by_name, v_trip.driver_name),
      updated_at = now()
  where stop.trip_id = v_trip.id
    and v_trip.status = 'finished'
    and stop.status = 'pending'
    and not exists (
      select 1 from public.trip_stop_tasks task
      where task.stop_id = stop.id
        and task.task_type in ('pickup_clean', 'deliver_clean')
        and task.status <> 'completed'
    );

  update public.trip_stop_tasks task
  set status = 'completed',
      completed_at = coalesce(task.completed_at, v_trip.ended_at, now()),
      updated_at = now()
  from public.trip_stops stop
  where task.stop_id = stop.id
    and stop.trip_id = v_trip.id
    and stop.status = 'completed'
    and task.task_type = 'pickup_dirty'
    and task.status = 'pending'
    and v_trip.status = 'finished';

  perform private.resequence_trip_stops(v_trip.id);
end;
$$;

revoke execute on function private.sync_trip_course(uuid) from public, anon, authenticated;

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
      from public.trip_stops s
      where s.trip_id = dt.id
        and not (
          s.status = 'skipped' and (
            s.completed_at is null
            or (dt.started_at is not null and s.completed_at < dt.started_at)
            or (dt.started_at is null and s.stop_kind = 'scheduled')
          )
        )
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

-- Use the assigned trip even after handoff or a later-day correction.
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
  v_assigned_trip_id uuid := coalesce(new.driver_pickup_trip_id, old.driver_pickup_trip_id);
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

  if v_assigned_trip_id is not null then
    select dt.* into v_trip
    from public.driver_trips dt
    where dt.id = v_assigned_trip_id
      and dt.status in ('planned', 'active', 'handover', 'finished');
  else
    select dt.* into v_trip
    from public.driver_trips dt
    where dt.driver_name = v_actor_name
      and dt.trip_date = public.lebuser_operational_date()
      and dt.status in ('active', 'finished')
      and private.trip_includes_client(dt.routes, dt.extra_clients, new.route_id, new.client_name)
    order by (dt.status = 'active') desc, dt.started_at desc
    limit 1;
  end if;

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
  where stop_id = v_stop.id and entry_id = new.id and status <> 'skipped';

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

commit;
