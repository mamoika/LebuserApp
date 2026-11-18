begin;

-- Explicit assignment wins over the display name, including after handoff.
-- Older entries without an assignment can still be handled by their driver.
create or replace function private.can_change_laundry_delivery(
  p_entry public.entries, p_driver_id uuid, p_driver_name text, p_undo boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_driver_id is null or exists (
    select 1 from public.driver_trips trip
    where trip.driver_id = p_driver_id
      and trip.status = 'active'
      and (
        trip.id = p_entry.driver_pickup_trip_id
        or (
          p_entry.driver_pickup_trip_id is null
          and exists (
            select 1
            from public.trip_stops stop
            join public.trip_stop_tasks task on task.stop_id = stop.id
            where stop.trip_id = trip.id
              and stop.status is distinct from 'skipped'
              and task.status is distinct from 'skipped'
              and task.task_type = 'deliver_clean'
              and task.entry_id = p_entry.id
          )
        )
      )
  ) or (
    p_entry.driver_pickup_trip_id is null
    and case when p_undo then p_entry.delivered_by else p_entry.picked_by end = p_driver_name
  );
$$;

create or replace function private.confirm_laundry_delivery(
  p_ids text[], p_driver_id uuid, p_driver_name text, p_trolley_actions jsonb
)
returns json
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[];
  v_entry public.entries;
  v_cycle public.laundry_trolley_cycles;
  v_client text;
  v_changes jsonb := '[]'::jsonb;
  v_action text;
  v_actions jsonb := coalesce(p_trolley_actions, '[]'::jsonb);
  v_processed uuid[] := array[]::uuid[];
begin
  select array_agg(distinct id order by id) into v_ids
  from unnest(p_ids) id where id is not null;
  if v_ids is null then return json_build_object('ok', true, 'affected', 0); end if;

  if jsonb_typeof(v_actions) <> 'array' then
    raise exception 'delivery_trolley_state_changed';
  end if;

  for v_entry in
    select entry.* from public.entries entry
    where entry.id = any(v_ids)
    order by entry.id
    for update
  loop
    if v_entry.deleted_at is not null or not coalesce(v_entry.done, false)
       or coalesce(v_entry.delivered, false)
       or not coalesce(private.can_change_laundry_delivery(v_entry, p_driver_id, p_driver_name, false), false) then
      return json_build_object('ok', true, 'affected', 0);
    end if;
    v_client := coalesce(v_client, v_entry.client_name);
    if v_entry.client_name is distinct from v_client then
      raise exception 'delivery_trolley_state_changed';
    end if;
  end loop;

  if (select count(*) from public.entries where id = any(v_ids)) <> cardinality(v_ids) then
    return json_build_object('ok', true, 'affected', 0);
  end if;

  -- Derive the actual physical load from the database, including the other
  -- trolleys of a multi-trolley batch. The client can request a legacy return.
  for v_cycle in
    select cycle.*
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
      and cycle.status not in ('returned', 'canceled')
      and (
        (
          coalesce(cycle.load_kind, 'laundry') = 'laundry'
          and cycle.trolley_no <> 'brak'
          and cycle.entry_ids && v_ids
        )
        or exists (
          select 1 from jsonb_array_elements(v_actions) action
          where action->>'cycle_id' = cycle.id::text
        )
      )
    order by cycle.id
    for update
  loop
    select action->>'action' into v_action
    from jsonb_array_elements(v_actions) action
    where action->>'cycle_id' = v_cycle.id::text
    limit 1;
    v_action := coalesce(v_action, 'leave');

    if v_cycle.client_name is distinct from v_client
       or v_action not in ('leave', 'return')
       or (not coalesce(v_cycle.entry_ids && v_ids, false)
           and not (v_action = 'return' and v_cycle.status = 'at_client'))
       or (
         v_cycle.entry_ids && v_ids and exists (
           select 1 from public.entries entry
           where entry.id = any(v_cycle.entry_ids)
             and entry.deleted_at is null
             and not (entry.id = any(v_ids))
             and not coalesce(entry.delivered, false)
         )
       ) then
      raise exception 'delivery_trolley_state_changed';
    end if;

    v_processed := array_append(v_processed, v_cycle.id);
    if v_action = 'leave' and v_cycle.status = 'at_client' then continue; end if;

    v_changes := v_changes || jsonb_build_object(
      'cycle_id', v_cycle.id,
      'prev_status', v_cycle.status,
      'prev_delivered_at', v_cycle.delivered_at,
      'prev_delivered_by', v_cycle.delivered_by,
      'prev_returned_at', v_cycle.returned_at,
      'prev_returned_by', v_cycle.returned_by,
      'new_status', case when v_action = 'leave' then 'at_client' else 'returned' end,
      'transition_at', now()
    );

    update public.laundry_trolley_cycles
    set status = case when v_action = 'leave' then 'at_client' else 'returned' end,
        delivered_at = case when v_action = 'leave' then now() else delivered_at end,
        delivered_by = case when v_action = 'leave' then p_driver_name else delivered_by end,
        returned_at = case when v_action = 'return' then now() else returned_at end,
        returned_by = case when v_action = 'return' then p_driver_name else returned_by end,
        updated_at = now()
    where id = v_cycle.id;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(v_actions) action
    where not exists (
      select 1 from unnest(v_processed) id where id::text = action->>'cycle_id'
    )
  ) then
    raise exception 'delivery_trolley_state_changed';
  end if;

  update public.entries
  set delivered = true, delivered_by = p_driver_name, delivered_at = now()
  where id = any(v_ids);

  if jsonb_array_length(v_changes) > 0 then
    insert into public.laundry_trolley_delivery_events (entry_ids, driver_name, changes)
    values (v_ids, p_driver_name, v_changes);
  end if;

  return json_build_object('ok', true, 'affected', cardinality(v_ids));
end;
$$;

create or replace function private.undo_laundry_delivery(
  p_ids text[], p_driver_id uuid, p_driver_name text
)
returns json
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := array[]::text[];
  v_entry public.entries;
  v_event public.laundry_trolley_delivery_events;
  v_change jsonb;
  v_cycle public.laundry_trolley_cycles;
begin
  for v_entry in
    select entry.* from public.entries entry
    where entry.id = any(p_ids)
      and entry.deleted_at is null and entry.delivered is true
    order by entry.id
    for update
  loop
    if not coalesce(private.can_change_laundry_delivery(v_entry, p_driver_id, p_driver_name, true), false) then
      return json_build_object('ok', true, 'affected', 0);
    end if;
    v_ids := array_append(v_ids, v_entry.id);
  end loop;

  update public.entries
  set delivered = false, delivered_by = null, delivered_at = null
  where id = any(v_ids);

  for v_event in
    select event.* from public.laundry_trolley_delivery_events event
    where event.undone_at is null and event.entry_ids && v_ids
    order by event.created_at desc, event.id
    for update
  loop
    for v_change in select * from jsonb_array_elements(v_event.changes)
    loop
      select * into v_cycle from public.laundry_trolley_cycles
      where id = (v_change->>'cycle_id')::uuid for update;

      if v_cycle.id is null or v_cycle.status <> (v_change->>'new_status')
         or (v_change ? 'transition_at' and v_cycle.updated_at is distinct from (v_change->>'transition_at')::timestamptz)
         or exists (
           select 1 from public.entries entry
           where entry.deleted_at is null and entry.delivered is true
             and entry.id = any(case when v_cycle.entry_ids && v_event.entry_ids
               then v_cycle.entry_ids else v_event.entry_ids end)
         ) then
        continue;
      end if;

      -- A returned trolley may already be reserved for another operation.
      if v_cycle.returned_at is not null then
        perform pg_advisory_xact_lock(hashtextextended(concat('physical-trolley|', lower(v_cycle.trolley_no)), 0));
        if exists (select 1 from private.active_laundry_trolley_cycle(v_cycle.trolley_no))
           or exists (
             select 1 from private.active_arrival_trolley_reservations() reservation
             where lower(reservation.trolley_no) = lower(v_cycle.trolley_no)
           ) then
          continue;
        end if;
      end if;

      update public.laundry_trolley_cycles
      set status = v_change->>'prev_status',
          delivered_at = (v_change->>'prev_delivered_at')::timestamptz,
          delivered_by = v_change->>'prev_delivered_by',
          returned_at = (v_change->>'prev_returned_at')::timestamptz,
          returned_by = v_change->>'prev_returned_by',
          updated_at = now()
      where id = v_cycle.id;
    end loop;

    if not exists (
      select 1 from public.entries entry
      where entry.id = any(v_event.entry_ids) and entry.deleted_at is null and entry.delivered is true
    ) then
      update public.laundry_trolley_delivery_events set undone_at = now() where id = v_event.id;
    end if;
  end loop;

  return json_build_object('ok', true, 'affected', cardinality(v_ids));
end;
$$;

create or replace function public.driver_deliver_entries(
  p_session_token text, p_ids text[], p_trolley_actions jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  return private.confirm_laundry_delivery(p_ids, v_driver.id, v_driver.name, p_trolley_actions);
end;
$$;

create or replace function public.driver_undo_deliver(p_session_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  return private.undo_laundry_delivery(p_ids, v_driver.id, v_driver.name);
end;
$$;

create or replace function public.admin_deliver_entries(
  p_session_token text, p_ids text[], p_driver_name text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.require_admin(p_session_token);
  select coalesce(nullif(trim(p_driver_name), ''), name) into v_name
  from public.session_user(p_session_token) limit 1;
  return private.confirm_laundry_delivery(p_ids, null, v_name, '[]'::jsonb);
end;
$$;

create or replace function public.admin_undo_deliver(p_session_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin(p_session_token);
  return private.undo_laundry_delivery(p_ids, null, null);
end;
$$;

create or replace function private.cancel_empty_transfer_on_delivery_undo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.laundry_trolley_cycles;
begin
  if not coalesce(old.delivered, false) or coalesce(new.delivered, false) then return new; end if;

  for v_cycle in
    select cycle.* from public.laundry_trolley_cycles cycle
    where cycle.load_kind = 'empty_transfer'
      and cycle.returned_at is null
      and new.id = any(cycle.entry_ids)
    order by cycle.id
    for update
  loop
    if not exists (
      select 1 from public.entries entry
      where entry.id = any(v_cycle.entry_ids) and entry.deleted_at is null and entry.delivered is true
    ) then
      update public.laundry_trolley_cycles
      set status = 'canceled', returned_at = now(), returned_by = coalesce(old.delivered_by, 'System'), updated_at = now()
      where id = v_cycle.id;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.can_change_laundry_delivery(public.entries, uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.confirm_laundry_delivery(text[], uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.undo_laundry_delivery(text[], uuid, text) from public, anon, authenticated;

-- In-course clean pickup and dispatch corrections move the physical load
-- along with the laundry entries. Pre-departure loading keeps its own RPC.
create or replace function private.change_laundry_pickup(
  p_ids text[], p_driver_id uuid, p_driver_name text, p_baskets integer,
  p_leave_trolley boolean, p_undo boolean
)
returns json
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[];
  v_entry public.entries;
  v_trip_id uuid;
  v_entry_trip_id uuid;
  v_cycle public.laundry_trolley_cycles;
begin
  select array_agg(distinct id order by id) into v_ids
  from unnest(p_ids) id where id is not null;
  if v_ids is null then return json_build_object('ok', true, 'affected', 0); end if;
  if (select count(*) from public.entries where id = any(v_ids)) <> cardinality(v_ids) then
    return json_build_object('ok', true, 'affected', 0);
  end if;

  for v_entry in
    select entry.* from public.entries entry
    where entry.id = any(v_ids) order by entry.id for update
  loop
    if v_entry.deleted_at is not null or coalesce(v_entry.delivered, false)
       or coalesce(v_entry.done, false) is distinct from p_undo
       or (
         not p_undo and v_entry.laundry_ready_at is null and v_entry.laundry_packed_at is null
         and coalesce(v_entry.laundry_status, '') not in ('packed', 'released')
       )
       or not coalesce(private.can_change_laundry_delivery(v_entry, p_driver_id, p_driver_name, false), false) then
      return json_build_object('ok', true, 'affected', 0);
    end if;

    select trip.id into v_entry_trip_id
    from public.driver_trips trip
    where trip.status = 'active'
      and (trip.driver_id = p_driver_id or (p_driver_id is null and trip.driver_name = p_driver_name))
      and (
        trip.id = v_entry.driver_pickup_trip_id
        or (
          v_entry.driver_pickup_trip_id is null and exists (
            select 1 from public.trip_stops stop join public.trip_stop_tasks task on task.stop_id = stop.id
            where stop.trip_id = trip.id and task.task_type = 'pickup_clean' and task.entry_id = v_entry.id
              and stop.status is distinct from 'skipped' and task.status is distinct from 'skipped'
          )
        )
      )
    order by trip.started_at desc nulls last, trip.id
    limit 1;

    if p_driver_id is not null and not p_undo and v_entry_trip_id is null then
      return json_build_object('ok', true, 'affected', 0);
    end if;
    if v_entry.id = v_ids[1] then
      v_trip_id := v_entry_trip_id;
    elsif not p_undo and v_entry_trip_id is distinct from v_trip_id then
      raise exception 'delivery_trolley_state_changed';
    end if;
  end loop;

  for v_cycle in
    select cycle.* from public.laundry_trolley_cycles cycle
    where cycle.entry_ids && v_ids and cycle.returned_at is null
      and cycle.status in ('packed', 'released')
      and cycle.load_kind is distinct from 'empty_transfer'
    order by cycle.id for update
  loop
    if exists (
      select 1 from public.entries entry
      where entry.id = any(v_cycle.entry_ids) and entry.deleted_at is null
        and not (entry.id = any(v_ids))
        and coalesce(entry.done, false) is not distinct from p_undo
    ) then
      raise exception 'delivery_trolley_state_changed';
    end if;
    if p_undo and v_cycle.status = 'released' then
      update public.laundry_trolley_cycles
      set status = 'packed', released_at = null, released_by = null, updated_at = now()
      where id = v_cycle.id;
    elsif not p_undo then
      update public.laundry_trolley_cycles
      set status = case when p_leave_trolley then 'returned' else 'released' end,
          released_at = case when p_leave_trolley then released_at else coalesce(released_at, now()) end,
          released_by = case when p_leave_trolley then released_by else coalesce(released_by, p_driver_name) end,
          returned_at = case when p_leave_trolley then now() else returned_at end,
          returned_by = case when p_leave_trolley then p_driver_name else returned_by end,
          updated_at = now()
      where id = v_cycle.id;
    end if;
  end loop;

  update public.entries entry
  set done = not p_undo,
      picked_by = case when not p_undo then p_driver_name end,
      picked_at = case when not p_undo then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      picked_baskets = case when not p_undo then greatest(0, coalesce(p_baskets, 1)) end,
      driver_pickup_trip_id = case when p_undo then entry.driver_pickup_trip_id
        else coalesce(entry.driver_pickup_trip_id, v_trip_id) end,
      laundry_trolley_cycle_id = case when p_leave_trolley and not p_undo then null
        else entry.laundry_trolley_cycle_id end
  where entry.id = any(v_ids);

  return json_build_object('ok', true, 'affected', cardinality(v_ids));
end;
$$;

create or replace function public.admin_pickup_entries(
  p_session_token text, p_ids text[], p_driver_name text, p_baskets integer default 1
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.require_admin(p_session_token);
  select coalesce(nullif(trim(p_driver_name), ''), name) into v_name
  from public.session_user(p_session_token) limit 1;
  return private.change_laundry_pickup(p_ids, null, v_name, p_baskets, false, false);
end;
$$;

create or replace function public.admin_undo_pickup(p_session_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin(p_session_token);
  return private.change_laundry_pickup(p_ids, null, null, null, false, true);
end;
$$;

create or replace function public.driver_pickup_entries(
  p_session_token text, p_ids text[], p_baskets integer default 1, p_leave_trolley boolean default false
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  return private.change_laundry_pickup(p_ids, v_driver.id, v_driver.name, p_baskets, coalesce(p_leave_trolley, false), false);
end;
$$;

create or replace function public.driver_undo_pickup(p_session_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  return private.change_laundry_pickup(p_ids, v_driver.id, v_driver.name, null, false, true);
end;
$$;

revoke all on function private.change_laundry_pickup(text[], uuid, text, integer, boolean, boolean) from public, anon, authenticated;

commit;
