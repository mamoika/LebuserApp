-- ============================================================
-- Kierowca: załadunek czystego przed wyjazdem i punkty po brudne.
--
-- Uruchom w Supabase -> SQL Editor. Idempotentne.
-- ============================================================

alter table public.trip_stops drop constraint if exists trip_stops_stop_kind_check;
alter table public.trip_stops
  add constraint trip_stops_stop_kind_check
  check (stop_kind in ('client', 'extra', 'dirty_only'));

create or replace function public.driver_pickup_planned_clean(
  p_session_token text,
  p_trip_id uuid,
  p_ids text[],
  p_leave_trolley boolean default false,
  p_include_client text default null
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
  v_baskets integer;
  v_entry record;
  v_include_client text := nullif(trim(coalesce(p_include_client, '')), '');
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
    return json_build_object('error', 'Brak prania do odbioru');
  end if;

  select count(distinct requested.entry_id) into v_requested
  from unnest(p_ids) as requested(entry_id);

  perform 1
  from public.entries
  where id = any(p_ids)
  for update;

  if v_include_client is not null then
    if exists (
      select 1
      from public.entries
      where id = any(p_ids)
        and client_name is distinct from v_include_client
    ) then
      return json_build_object('error', 'Wybrane pranie należy do różnych klientów');
    end if;
  end if;

  select count(distinct e.id)
  into v_valid
  from public.entries e
  where e.id = any(p_ids)
    and e.deleted_at is null
    and coalesce(e.done, false) = false
    and coalesce(e.delivered, false) = false
    and public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) <= v_trip.trip_date
    and (
      e.laundry_ready_at is not null
      or e.laundry_packed_at is not null
      or e.laundry_status in ('packed', 'released')
    )
    and (
      private.trip_includes_client(v_trip.routes, v_trip.extra_clients, e.route_id, e.client_name)
      or (v_include_client is not null and e.client_name = v_include_client)
    );

  if v_valid <> v_requested then
    return json_build_object(
      'error',
      'Lista gotowego prania zmieniła się. Odśwież plan i spróbuj ponownie.'
    );
  end if;

  if v_include_client is not null then
    v_extra_clients := case
      when v_trip.extra_clients is not null
       and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
        then v_trip.extra_clients::jsonb
      else '[]'::jsonb
    end;

    if not (v_extra_clients ? v_include_client) then
      v_extra_clients := v_extra_clients || jsonb_build_array(v_include_client);
      update public.driver_trips
      set extra_clients = v_extra_clients::text
      where id = v_trip.id;
      v_trip.extra_clients := v_extra_clients::text;
    end if;
  end if;

  select greatest(1, count(distinct trim(trolley.value)))
  into v_baskets
  from public.entries e
  cross join lateral unnest(
    string_to_array(coalesce(nullif(e.laundry_trolley_no, ''), 'brak'), ',')
  ) as trolley(value)
  where e.id = any(p_ids);

  update public.entries
  set done = true,
      picked_by = v_driver.name,
      picked_at = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      picked_baskets = v_baskets
  where id = any(p_ids)
    and coalesce(done, false) = false;

  get diagnostics v_affected = row_count;

  if v_affected <> v_requested then
    raise exception 'Nie udało się odebrać całego wybranego prania';
  end if;

  if p_leave_trolley then
    for v_entry in (
      select distinct laundry_trolley_cycle_id
      from public.entries
      where id = any(p_ids)
        and laundry_trolley_cycle_id is not null
    ) loop
      update public.laundry_trolley_cycles
      set status = 'returned',
          returned_at = now(),
          returned_by = v_driver.name,
          updated_at = now()
      where id = v_entry.laundry_trolley_cycle_id
        and returned_at is null;
    end loop;

    update public.entries
    set laundry_trolley_cycle_id = null
    where id = any(p_ids);
  end if;

  perform private.sync_trip_course(v_trip.id);

  return json_build_object(
    'ok', true,
    'affected', v_affected,
    'picked_at', now(),
    'picked_by', v_driver.name
  );
end;
$$;

create or replace function public.driver_add_dirty_planned_stop(
  p_session_token text,
  p_trip_id uuid,
  p_client_name text
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_actor record;
  v_trip public.driver_trips;
  v_client public.clients;
  v_position integer;
  v_stop public.trip_stops;
  v_is_other_route boolean;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  select * into v_actor from public.session_user(p_session_token) limit 1;
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id
    and driver_id = v_driver.id
    and status = 'planned'
  for update;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu kierowcy');
  end if;

  select * into v_client
  from public.clients
  where name = p_client_name
  limit 1;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  v_is_other_route := not private.trip_includes_client(
    v_trip.routes, null, v_client.route_id, v_client.name
  );

  select * into v_stop
  from public.trip_stops
  where trip_id = v_trip.id and client_name = v_client.name
  limit 1;

  if v_stop.id is not null then
    update public.trip_stops
    set stop_kind = 'dirty_only',
        status = 'pending',
        completed_at = null,
        completed_by_user_id = null,
        completed_by_name = null,
        updated_at = now()
    where id = v_stop.id
    returning * into v_stop;
  else
    select coalesce(max(position), 0) + 1
    into v_position
    from public.trip_stops
    where trip_id = v_trip.id;

    insert into public.trip_stops (
      trip_id, client_id, client_name, route_id, position, stop_kind, note
    )
    values (
      v_trip.id, v_client.id, v_client.name, v_client.route_id,
      v_position, 'dirty_only', v_client.note
    )
    returning * into v_stop;
  end if;

  perform private.sync_trip_course(v_trip.id);
  select * into v_stop from public.trip_stops where id = v_stop.id;

  insert into public.trip_events (
    trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data
  )
  values (
    v_trip.id, v_stop.id, 'dirty_stop_added', v_actor.id, v_actor.name, v_actor.role,
    'Kierowca dodał punkt po brudne: ' || v_client.name,
    jsonb_build_object(
      'client_name', v_client.name,
      'source_route_id', v_client.route_id,
      'is_other_route', v_is_other_route
    )
  );

  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.driver_remove_dirty_planned_stop(
  p_session_token text,
  p_trip_id uuid,
  p_client_name text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver record;
  v_trip public.driver_trips;
  v_removed integer;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id
    and driver_id = v_driver.id
    and status = 'planned';

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu kierowcy');
  end if;

  delete from public.trip_stops
  where trip_id = v_trip.id
    and client_name = p_client_name
    and stop_kind = 'dirty_only';

  get diagnostics v_removed = row_count;
  return json_build_object('ok', true, 'removed', v_removed);
end;
$$;

create or replace function public.driver_finalize_trip_plan(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_trip public.driver_trips;
  v_removed integer;
  v_active integer;
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

  perform private.sync_trip_course(v_trip.id);

  update public.trip_stops s
  set stop_kind = 'dirty_only',
      updated_at = now()
  where s.trip_id = v_trip.id
    and s.status = 'pending'
    and not exists (
      select 1
      from public.trip_stop_tasks task
      join public.entries e on e.id = task.entry_id
      where task.stop_id = s.id
        and task.task_type = 'deliver_clean'
        and coalesce(e.done, false) = true
        and coalesce(e.delivered, false) = false
        and e.picked_by = v_driver.name
    )
    and exists (
      select 1
      from public.trip_stop_tasks task
      where task.stop_id = s.id
        and task.task_type = 'pickup_dirty'
        and task.status = 'pending'
    );

  delete from public.trip_stop_tasks task
  using public.trip_stops s, public.entries e
  where task.stop_id = s.id
    and task.entry_id = e.id
    and s.trip_id = v_trip.id
    and task.task_type in ('pickup_clean', 'deliver_clean')
    and not (
      coalesce(e.done, false) = true
      and coalesce(e.delivered, false) = false
      and e.picked_by = v_driver.name
    );

  update public.trip_stops s
  set status = 'skipped',
      updated_at = now()
  where s.trip_id = v_trip.id
    and s.status = 'pending'
    and s.stop_kind <> 'dirty_only'
    and not exists (
      select 1
      from public.trip_stop_tasks task
      join public.entries e on e.id = task.entry_id
      where task.stop_id = s.id
        and task.task_type = 'deliver_clean'
        and coalesce(e.done, false) = true
        and coalesce(e.delivered, false) = false
        and e.picked_by = v_driver.name
    )
    and not exists (
      select 1
      from public.trip_stop_tasks task
      where task.stop_id = s.id
        and task.task_type = 'pickup_dirty'
        and task.status = 'pending'
    );

  get diagnostics v_removed = row_count;

  select count(*)
  into v_active
  from public.trip_stops
  where trip_id = v_trip.id and status = 'pending';

  if v_active = 0 then
    raise exception 'Plan jest pusty. Odbierz gotowe czyste albo dodaj punkt po brudne.';
  end if;

  return json_build_object('ok', true, 'stops', v_active, 'removed', v_removed);
end;
$$;

create or replace function private.guard_active_clean_trip_task()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip_status text;
  v_trip_driver text;
  v_done boolean;
  v_picked_by text;
begin
  if new.task_type not in ('pickup_clean', 'deliver_clean') then
    return new;
  end if;

  select trip.status, trip.driver_name
  into v_trip_status, v_trip_driver
  from public.trip_stops stop
  join public.driver_trips trip on trip.id = stop.trip_id
  where stop.id = new.stop_id;

  if v_trip_status not in ('active', 'handover') then
    return new;
  end if;

  select coalesce(done, false), picked_by
  into v_done, v_picked_by
  from public.entries
  where id = new.entry_id;

  if not coalesce(v_done, false) or v_picked_by is distinct from v_trip_driver then
    return null;
  end if;

  return new;
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
    from public.entries e
    where e.client_name = new.client_name
      and e.deleted_at is null
      and (
        (
          coalesce(e.done, false) = true
          and coalesce(e.delivered, false) = false
          and e.picked_by = v_trip.driver_name
        )
        or private.entry_arrival_date(e.week_key, e.arr_day) = v_trip.trip_date
      )
  ) then
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists guard_active_trip_stop on public.trip_stops;
create trigger guard_active_trip_stop
before insert on public.trip_stops
for each row execute function private.guard_active_trip_stop();

revoke execute on function private.guard_active_trip_stop() from public, anon, authenticated;

drop trigger if exists guard_active_clean_trip_task on public.trip_stop_tasks;
create trigger guard_active_clean_trip_task
before insert on public.trip_stop_tasks
for each row execute function private.guard_active_clean_trip_task();

revoke execute on function private.guard_active_clean_trip_task() from public, anon, authenticated;

grant execute on function public.driver_pickup_planned_clean(text, uuid, text[], boolean, text) to anon, authenticated;
grant execute on function public.driver_add_dirty_planned_stop(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_remove_dirty_planned_stop(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_finalize_trip_plan(text, uuid) to anon, authenticated;
