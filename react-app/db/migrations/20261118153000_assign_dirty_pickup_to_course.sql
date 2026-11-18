begin;

alter table public.entries
  add column if not exists dirty_pickup_trip_id uuid references public.driver_trips(id) on delete set null;

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
          or (
            entry.dirty_pickup_trip_id = v_trip.id
            or (entry.dirty_pickup_trip_id is null
              and private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date)
          )
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
    where (entry.dirty_pickup_trip_id = v_trip.id)
       or (entry.dirty_pickup_trip_id is null
         and private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date)
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

create or replace function private.guard_active_trip_stop()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
begin
  select * into v_trip
  from public.driver_trips
  where id = new.trip_id;

  if v_trip.status not in ('active', 'handover') or new.stop_kind = 'dirty_only' then
    return new;
  end if;

  if exists (
    select 1
    from public.entries entry
    where entry.client_name = new.client_name
      and entry.deleted_at is null
      and (
        (
          coalesce(entry.done, false) = true
          and coalesce(entry.delivered, false) = false
          and entry.driver_pickup_trip_id = v_trip.id
        )
        or entry.dirty_pickup_trip_id = v_trip.id
        or (entry.dirty_pickup_trip_id is null
          and private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date)
      )
  ) then
    return new;
  end if;

  return null;
end;
$$;

create or replace function private.receive_dirty_trolleys_on_trip_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_no text;
begin
  if old.status is not distinct from new.status or new.status <> 'finished' then
    return new;
  end if;

  for v_entry in
    select distinct entry.id, entry.client_name, entry.arrival_trolley_nos
    from public.trip_stops stop
    join public.trip_stop_tasks task on task.stop_id = stop.id
    join public.entries entry on entry.id = task.entry_id
    where stop.trip_id = new.id
      and task.task_type = 'pickup_dirty'
      and (entry.dirty_pickup_trip_id is null or entry.dirty_pickup_trip_id = new.id)
      and task.status is distinct from 'skipped'
      and stop.status is distinct from 'skipped'
      and entry.deleted_at is null
      and entry.dirty_received_at is null
      and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
  loop
    update public.entries
    set dirty_received_at = coalesce(new.ended_at, now()),
        dirty_received_by = new.driver_name
    where id = v_entry.id and dirty_received_at is null;
    if not found then continue; end if;

    for v_no in
      select distinct trim(value)
      from unnest(string_to_array(v_entry.arrival_trolley_nos, ',')) value
      where nullif(trim(value), '') is not null
    loop
      perform private.record_trolley_event(
        v_no, 'dirty_received_at_laundry', 'returning_to_laundry', 'dirty_at_laundry',
        'laundry', v_entry.client_name, v_entry.id, null, new.driver_name,
        coalesce(new.ended_at, now()), jsonb_build_object('trip_id', new.id)
      );
    end loop;
  end loop;
  return new;
end;
$$;

create or replace function private.receive_dirty_entry_from_finished_trip(p_entry_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_trip record;
  v_received_at timestamptz;
  v_no text;
begin
  if p_entry_id is null then
    return;
  end if;

  select entry.id, entry.client_name, entry.arrival_trolley_nos, entry.dirty_pickup_trip_id
  into v_entry
  from public.entries entry
  where entry.id = p_entry_id
    and entry.deleted_at is null
    and not coalesce(entry.washed, false)
    and entry.dirty_received_at is null
    and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
  for update;

  if v_entry.id is null then
    return;
  end if;

  select trip.id, trip.driver_name,
         coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) as received_at
  into v_trip
  from public.trip_stop_tasks task
  join public.trip_stops stop on stop.id = task.stop_id
  join public.driver_trips trip on trip.id = stop.trip_id
  where task.entry_id = v_entry.id
    and task.task_type = 'pickup_dirty'
    and task.status is distinct from 'skipped'
    and stop.status is distinct from 'skipped'
    and trip.status = 'finished'
    and (v_entry.dirty_pickup_trip_id is null or v_entry.dirty_pickup_trip_id = trip.id)
  order by coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) desc
  limit 1;

  if v_trip.id is null then
    return;
  end if;

  v_received_at := coalesce(v_trip.received_at, now());

  update public.entries
  set dirty_received_at = v_received_at,
      dirty_received_by = v_trip.driver_name
  where id = v_entry.id
    and dirty_received_at is null;

  for v_no in
    select distinct trim(value)
    from unnest(string_to_array(v_entry.arrival_trolley_nos, ',')) value
    where nullif(trim(value), '') is not null
  loop
    perform private.record_trolley_event(
      v_no,
      'dirty_received_at_laundry',
      'returning_to_laundry',
      'dirty_at_laundry',
      'laundry',
      v_entry.client_name,
      v_entry.id,
      null,
      v_trip.driver_name,
      v_received_at,
      jsonb_build_object('trip_id', v_trip.id, 'source', 'finished_trip_correction')
    );
  end loop;
end;
$$;

-- Record the dirty pickup and bind it to its course in the same transaction.
create or replace function public.add_dirty_laundry_to_trip(
  p_session_token text,
  p_trip_id uuid,
  p_id text,
  p_week_key text,
  p_client_name text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_type text,
  p_weight numeric,
  p_trolleys integer,
  p_urgent boolean,
  p_arrival_trolley_nos text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_extra jsonb;
  v_result json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;

  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if v_trip.id is null
     or not coalesce((
       (v_user.role = 'admin' and v_trip.status in ('active', 'handover', 'planned', 'finished'))
       or (v_user.role in ('driver', 'admin_viewer_driver') and v_trip.status = 'active' and v_trip.driver_id is not distinct from v_user.id)
     ), false)
     or private.entry_arrival_date(p_week_key, p_arr_day) is distinct from v_trip.trip_date then
    return json_build_object('error', 'dirty_pickup_trip_changed');
  end if;

  v_result := public.admin_insert_entry(
    p_session_token, p_id, p_week_key, p_client_name, p_arr_day, p_pick_day, p_pick_week_key,
    p_route_id, p_type, p_weight, p_trolleys, p_urgent, v_user.name, p_arrival_trolley_nos
  );
  if v_result->>'error' is not null then return v_result; end if;

  update public.entries set dirty_pickup_trip_id = v_trip.id where id = p_id;

  if not coalesce(private.trip_includes_client(v_trip.routes, v_trip.extra_clients, p_route_id, p_client_name), false) then
    v_extra := case when jsonb_typeof(nullif(v_trip.extra_clients, '')::jsonb) = 'array'
      then v_trip.extra_clients::jsonb else '[]'::jsonb end;
    update public.driver_trips
    set extra_clients = (v_extra || jsonb_build_array(p_client_name))::text
    where id = v_trip.id;
  end if;

  perform private.sync_trip_course(v_trip.id);
  return v_result;
end;
$$;

revoke all on function public.add_dirty_laundry_to_trip(text, uuid, text, text, text, integer, integer, text, integer, text, numeric, integer, boolean, text) from public;
grant execute on function public.add_dirty_laundry_to_trip(text, uuid, text, text, text, integer, integer, text, integer, text, numeric, integer, boolean, text) to anon, authenticated;

commit;
