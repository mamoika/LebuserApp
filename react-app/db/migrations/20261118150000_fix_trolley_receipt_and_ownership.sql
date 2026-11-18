begin;

create or replace function public.resolve_arrival_trolleys(
  p_client_name text,
  p_arrival_trolley_nos text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nos text[];
  v_no text;
  v_cycle public.laundry_trolley_cycles;
  v_cycles uuid[] := array[]::uuid[];
  v_by text := nullif(trim(coalesce(p_by, '')), '');
begin
  if nullif(trim(coalesce(p_arrival_trolley_nos, '')), '') is null then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  select coalesce(array_agg(distinct trim(x) order by trim(x)), array[]::text[])
  into v_nos
  from unnest(string_to_array(p_arrival_trolley_nos, ',')) as x
  where nullif(trim(x), '') is not null;

  if coalesce(array_length(v_nos, 1), 0) = 0 then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  foreach v_no in array v_nos loop
    perform pg_advisory_xact_lock(
      hashtextextended(concat('physical-trolley|', lower(v_no)), 0)
    );

    select cycle.* into v_cycle
    from public.laundry_trolley_cycles cycle
    where lower(trim(cycle.trolley_no)) = lower(v_no)
      and cycle.returned_at is null
      and cycle.status not in ('returned', 'canceled')
    order by cycle.packed_at desc
    limit 1 for update;

    if v_cycle.id is null then
      continue;
    end if;

    if v_cycle.status <> 'at_client' or v_cycle.client_name is distinct from p_client_name then
      return json_build_object(
        'error',
        format('Wózek %s jest zajęty przez: %s', v_no, v_cycle.client_name)
      );
    end if;

    v_cycles := array_append(v_cycles, v_cycle.id);
  end loop;

  -- Validate every number before closing any outgoing cycle. Returning JSON
  -- from a caller does not roll back work already done by this function.
  update public.laundry_trolley_cycles
  set status = 'returned',
      returned_by = coalesce(v_by, 'system'),
      returned_at = now(),
      updated_at = now()
  where id = any(v_cycles);

  update public.entries entry
  set laundry_status = 'returned'
  where exists (
    select 1 from public.laundry_trolley_cycles cycle
    where cycle.id = any(v_cycles)
      and cycle.load_kind is distinct from 'empty_transfer'
      and entry.id = any(cycle.entry_ids)
  ) and not exists (
    select 1 from public.laundry_trolley_cycles active
    where active.returned_at is null
      and active.status not in ('returned', 'canceled')
      and active.load_kind is distinct from 'empty_transfer'
      and entry.id = any(active.entry_ids)
  );

  return json_build_object(
    'ok', true,
    'trolleys', array_length(v_nos, 1),
    'nos', array_to_string(v_nos, ', ')
  );
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

  select entry.id, entry.client_name, entry.arrival_trolley_nos
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

create or replace function private.receive_dirty_on_trip_task_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_id is not null and new.task_type = 'pickup_dirty' then
    perform private.receive_dirty_entry_from_finished_trip(new.entry_id);
  end if;
  return new;
end;
$$;

create or replace function public.reassign_loaded_entries(
  p_trip public.driver_trips,
  p_from_name text,
  p_to_name text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_n integer;
begin
  update public.entries e
  set picked_by = p_to_name
  where e.deleted_at is null
    and e.done is true
    and coalesce(e.delivered, false) is false
    and (
      e.driver_pickup_trip_id = p_trip.id
      or (
        e.driver_pickup_trip_id is null
        and e.picked_by = p_from_name
        and public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = p_trip.trip_date
        and (
          coalesce(p_trip.routes, '') = ''
          or e.route_id = any(string_to_array(p_trip.routes, ',')::int[])
          or (
            p_trip.extra_clients is not null
            and jsonb_typeof(p_trip.extra_clients::jsonb) = 'array'
            and (p_trip.extra_clients::jsonb ? e.client_name)
          )
        )
      )
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.get_laundry_workflow(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_trolleys json;
  v_arrival_reservations json;
  v_trolley_count integer := 25;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Admin data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_trolleys
  from (
    select
      cycle.*,
      coalesce((
        select bool_and(coalesce(entry.delivered, entry.delivered_at is not null))
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ), false) as is_delivered,
      coalesce((
        select bool_or(entry.picked_at is not null or entry.delivered_at is not null or coalesce(entry.delivered, false) or coalesce(entry.done, false))
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ), false) as is_issued_to_driver,
      (
        select max(entry.delivered_at)
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ) as entry_delivered_at,
      (
        select string_agg(distinct entry.picked_by, ', ')
        from public.entries entry
        where entry.id = any(cycle.entry_ids)
          and entry.deleted_at is null
          and entry.picked_by is not null
          and trim(entry.picked_by) <> ''
      ) as driver_name
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
       or cycle.packed_at >= now() - interval '30 days'
    order by cycle.returned_at nulls first, cycle.packed_at desc
    limit 300
  ) x;

  select coalesce(json_agg(row_to_json(reservation)), '[]'::json)
  into v_arrival_reservations
  from (
    select reservation.trolley_no, reservation.client_name, reservation.entry_id, entry.dirty_received_at
    from private.active_arrival_trolley_reservations() reservation
    join public.entries entry on entry.id = reservation.entry_id
    order by case when reservation.trolley_no ~ '^[0-9]+$' then reservation.trolley_no::integer else 2147483647 end,
             reservation.trolley_no,
             reservation.client_name
  ) reservation;

  begin
    select case
      when jsonb_typeof(setting.value) = 'number' then setting.value::text::integer
      when jsonb_typeof(setting.value) = 'string'
        and trim(both '"' from setting.value::text) ~ '^[0-9]+$'
        then trim(both '"' from setting.value::text)::integer
      else 25
    end
    into v_trolley_count
    from public.app_settings setting
    where setting.key = 'laundry_trolley_count';
  exception
    when others then
      v_trolley_count := 25;
  end;

  v_trolley_count := greatest(1, least(99, coalesce(v_trolley_count, 25)));

  return json_build_object(
    'ok', true,
    'trolleys', v_trolleys,
    'arrival_reservations', v_arrival_reservations,
    'trolley_count', v_trolley_count
  );
end;
$$;

commit;
