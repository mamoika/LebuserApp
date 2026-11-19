begin;

-- Match the original return to this still-recorded pickup. Both pickup
-- paths write the same timestamp, at millisecond precision on the entry.
create or replace function private.restore_trolleys_from_reopened_pickup(p_ids text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cycle public.laundry_trolley_cycles;
  v_restored_ids uuid[] := array[]::uuid[];
  v_entry_id text;
  v_entry_cycle_id uuid;
  v_entry_trolley_nos text;
begin
  for v_cycle in
    select cycle.* from public.laundry_trolley_cycles cycle
    where cycle.entry_ids && p_ids and cycle.status = 'returned' and cycle.delivered_at is null
      and cycle.load_kind is distinct from 'empty_transfer' and cycle.trolley_no <> 'brak'
      and exists (
        select 1 from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.id = any(p_ids)
          and entry.picked_by = cycle.returned_by and entry.laundry_trolley_cycle_id is null
          and entry.picked_at = to_char(cycle.returned_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    order by cycle.id for update
  loop
    if exists (
      select 1 from public.entries entry
      where entry.id = any(v_cycle.entry_ids) and entry.deleted_at is null
        and not (entry.id = any(p_ids)) and (entry.done or entry.delivered)
    ) then
      raise exception 'delivery_trolley_state_changed';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('physical-trolley|' || lower(v_cycle.trolley_no), 0));
    perform pg_advisory_xact_lock(hashtextextended('arrival-trolley|' || lower(v_cycle.trolley_no), 0));
    if exists (select 1 from private.active_laundry_trolley_cycle(v_cycle.trolley_no))
       or exists (
         select 1 from private.active_arrival_trolley_reservations() reservation
         where lower(reservation.trolley_no) = lower(v_cycle.trolley_no)
       )
       or exists (
         select 1 from public.laundry_trolley_events event
         where lower(event.trolley_no) = lower(v_cycle.trolley_no)
           and event.occurred_at > v_cycle.returned_at
       ) then
      raise exception 'pickup_trolley_reused';
    end if;

    update public.laundry_trolley_cycles
    set status = 'packed', released_at = null, released_by = null,
        returned_at = null, returned_by = null, updated_at = now()
    where id = v_cycle.id;
    v_restored_ids := array_append(v_restored_ids, v_cycle.id);
  end loop;

  for v_entry_id in
    select distinct linked.id
    from public.laundry_trolley_cycles cycle
    cross join lateral unnest(cycle.entry_ids) linked(id)
    where cycle.id = any(v_restored_ids) and linked.id = any(p_ids)
  loop
    select (array_agg(cycle.id order by cycle.packed_at desc, cycle.id))[1],
           string_agg(distinct cycle.trolley_no, ', ' order by cycle.trolley_no)
    into v_entry_cycle_id, v_entry_trolley_nos
    from public.laundry_trolley_cycles cycle
    where v_entry_id = any(cycle.entry_ids) and cycle.returned_at is null
      and cycle.status in ('packed', 'released') and cycle.load_kind is distinct from 'empty_transfer';

    update public.entries
    set laundry_trolley_cycle_id = v_entry_cycle_id, laundry_trolley_no = v_entry_trolley_nos
    where id = v_entry_id;
  end loop;

end;
$$;

revoke all on function private.restore_trolleys_from_reopened_pickup(text[]) from public, anon, authenticated;

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

  if p_undo then
    perform private.restore_trolleys_from_reopened_pickup(v_ids);
  end if;

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

create or replace function public.driver_undo_planned_clean(
  p_session_token text,
  p_trip_id uuid,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_trip public.driver_trips;
  v_requested integer;
  v_valid integer;
  v_affected integer;
  v_client_name text;
  v_extra_clients jsonb;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id
    and driver_id = v_driver.id
    and status = 'planned'
  for update;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu kierowcy');
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak prania do cofnięcia');
  end if;

  select count(distinct requested.entry_id)
  into v_requested
  from unnest(p_ids) as requested(entry_id);

  perform 1
  from public.entries
  where id = any(p_ids)
  for update;

  select min(client_name)
  into v_client_name
  from public.entries
  where id = any(p_ids);

  select count(distinct e.id)
  into v_valid
  from public.entries e
  where e.id = any(p_ids)
    and coalesce(e.done, false) = true
    and coalesce(e.delivered, false) = false
    and e.picked_by = v_driver.name
    and e.driver_pickup_trip_id = v_trip.id
    and exists (
      select 1
      from public.trip_stop_tasks task
      join public.trip_stops stop on stop.id = task.stop_id
      where task.entry_id = e.id
        and task.task_type = 'pickup_clean'
        and stop.trip_id = v_trip.id
    );

  if v_valid <> v_requested then
    return json_build_object('error', 'Nie można cofnąć tego odbioru');
  end if;

  perform private.restore_trolleys_from_reopened_pickup(p_ids);

  update public.laundry_trolley_cycles
  set status = 'packed',
      released_at = null,
      released_by = null,
      updated_at = now()
  where entry_ids && p_ids
    and status = 'released'
    and returned_at is null
    and released_by = v_driver.name;

  update public.entries
  set done = false,
      picked_by = null,
      picked_at = null,
      picked_baskets = null,
      driver_pickup_trip_id = null,
      laundry_trolley_no = case
        when laundry_trolley_cycle_id is null then 'brak'
        else laundry_trolley_no
      end
  where id = any(p_ids)
    and picked_by = v_driver.name
    and coalesce(delivered, false) = false;

  get diagnostics v_affected = row_count;

  if v_affected <> v_requested then
    raise exception 'Nie udało się cofnąć całego odbioru';
  end if;

  if v_client_name is not null
     and v_trip.extra_clients is not null
     and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
     and v_trip.extra_clients::jsonb ? v_client_name
     and not exists (
       select 1
       from public.entries e
       where e.client_name = v_client_name
         and e.driver_pickup_trip_id = v_trip.id
         and coalesce(e.done, false) = true
         and coalesce(e.delivered, false) = false
     )
     and not exists (
       select 1
       from public.trip_stops stop
       where stop.trip_id = v_trip.id
         and stop.client_name = v_client_name
         and stop.status = 'pending'
         and (
           stop.stop_kind = 'dirty_only'
           or exists (
             select 1
             from public.trip_stop_tasks task
             where task.stop_id = stop.id
               and task.task_type = 'pickup_dirty'
               and task.status = 'pending'
           )
         )
     ) then
    select coalesce(jsonb_agg(extra.value), '[]'::jsonb)
    into v_extra_clients
    from jsonb_array_elements_text(v_trip.extra_clients::jsonb) as extra(value)
    where extra.value <> v_client_name;

    update public.driver_trips
    set extra_clients = v_extra_clients::text
    where id = v_trip.id;
  end if;

  perform private.sync_trip_course(v_trip.id);

  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

create or replace function public.admin_undo_planned_clean(
  p_session_token text,
  p_trip_id uuid,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin record;
  v_trip public.driver_trips;
  v_requested integer;
  v_affected integer;
  v_client_name text;
  v_extra_clients jsonb;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;
  if p_ids is null or array_length(p_ids, 1) is null then return json_build_object('error', 'Brak prania do cofnięcia'); end if;

  select count(distinct requested.entry_id) into v_requested from unnest(p_ids) as requested(entry_id);
  perform 1 from public.entries where id = any(p_ids) for update;
  select min(client_name) into v_client_name from public.entries where id = any(p_ids);

  if exists (
    select 1 from public.entries
    where id = any(p_ids)
      and (driver_pickup_trip_id is distinct from v_trip.id or coalesce(delivered, false) = true)
  ) then
    return json_build_object('error', 'Nie można cofnąć tego odbioru');
  end if;

  perform private.restore_trolleys_from_reopened_pickup(p_ids);

  update public.laundry_trolley_cycles
  set status = 'packed', released_at = null, released_by = null, updated_at = now()
  where entry_ids && p_ids and status = 'released' and returned_at is null;

  update public.entries
  set done = false, picked_by = null, picked_at = null, picked_baskets = null,
      driver_pickup_trip_id = null,
      laundry_trolley_no = case when laundry_trolley_cycle_id is null then 'brak' else laundry_trolley_no end
  where id = any(p_ids) and driver_pickup_trip_id = v_trip.id and coalesce(delivered, false) = false;

  get diagnostics v_affected = row_count;
  if v_affected <> v_requested then raise exception 'Nie udało się cofnąć całego odbioru'; end if;

  if v_client_name is not null
     and v_trip.extra_clients is not null
     and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
     and v_trip.extra_clients::jsonb ? v_client_name
     and not exists (
       select 1 from public.entries e
       where e.client_name = v_client_name
         and e.driver_pickup_trip_id = v_trip.id
         and coalesce(e.done, false) = true
         and coalesce(e.delivered, false) = false
     )
     and not exists (
       select 1 from public.trip_stops stop
       where stop.trip_id = v_trip.id and stop.client_name = v_client_name and stop.status = 'pending'
         and (
           stop.stop_kind = 'dirty_only'
           or exists (
             select 1 from public.trip_stop_tasks task
             where task.stop_id = stop.id and task.task_type = 'pickup_dirty' and task.status = 'pending'
           )
         )
     ) then
    select coalesce(jsonb_agg(extra.value), '[]'::jsonb) into v_extra_clients
    from jsonb_array_elements_text(v_trip.extra_clients::jsonb) as extra(value)
    where extra.value <> v_client_name;
    update public.driver_trips set extra_clients = v_extra_clients::text where id = v_trip.id;
  end if;

  perform private.sync_trip_course(v_trip.id);
  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (v_trip.id, 'pickup_undone', v_admin.id, v_admin.name, v_admin.role,
          'Administrator cofnął załadunek czystego prania', jsonb_build_object('entry_ids', p_ids));
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

commit;
