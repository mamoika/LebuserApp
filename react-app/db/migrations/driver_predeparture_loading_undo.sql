-- ============================================================
-- Kierowca: rezygnacja z odebranego czystego przed wyjazdem.
--
-- Uruchom po driver_predeparture_loading.sql.
-- ============================================================

alter table public.entries
  add column if not exists driver_pickup_trip_id uuid
  references public.driver_trips(id) on delete set null;

create index if not exists entries_driver_pickup_trip_id_idx
  on public.entries(driver_pickup_trip_id)
  where driver_pickup_trip_id is not null;

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

  select count(distinct requested.entry_id)
  into v_requested
  from unnest(p_ids) as requested(entry_id);

  perform 1 from public.entries where id = any(p_ids) for update;

  if v_include_client is not null and exists (
    select 1 from public.entries
    where id = any(p_ids) and client_name is distinct from v_include_client
  ) then
    return json_build_object('error', 'Wybrane pranie należy do różnych klientów');
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
      picked_baskets = v_baskets,
      driver_pickup_trip_id = v_trip.id
  where id = any(p_ids)
    and coalesce(done, false) = false;

  get diagnostics v_affected = row_count;
  if v_affected <> v_requested then
    raise exception 'Nie udało się odebrać całego wybranego prania';
  end if;

  if p_leave_trolley then
    update public.laundry_trolley_cycles
    set status = 'returned',
        returned_at = now(),
        returned_by = v_driver.name,
        updated_at = now()
    where entry_ids && p_ids
      and returned_at is null;

    update public.entries
    set laundry_trolley_cycle_id = null
    where id = any(p_ids);
  else
    update public.laundry_trolley_cycles
    set status = 'released',
        released_at = coalesce(released_at, now()),
        released_by = coalesce(released_by, v_driver.name),
        updated_at = now()
    where entry_ids && p_ids
      and returned_at is null;
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

create or replace function public.driver_start_finalized_trip(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_result json;
  v_active integer;
begin
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id
  for update;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu');
  end if;

  v_result := public.driver_finalize_trip_plan(p_session_token, p_trip_id);
  if v_result->>'error' is not null then
    raise exception '%', v_result->>'error';
  end if;

  delete from public.trip_stop_tasks task
  using public.trip_stops stop, public.entries entry
  where task.stop_id = stop.id
    and task.entry_id = entry.id
    and stop.trip_id = v_trip.id
    and task.task_type in ('pickup_clean', 'deliver_clean')
    and entry.driver_pickup_trip_id is distinct from v_trip.id;

  update public.trip_stops stop
  set status = 'skipped',
      updated_at = now()
  where stop.trip_id = v_trip.id
    and stop.status = 'pending'
    and stop.stop_kind <> 'dirty_only'
    and not exists (
      select 1
      from public.trip_stop_tasks task
      join public.entries entry on entry.id = task.entry_id
      where task.stop_id = stop.id
        and task.task_type = 'deliver_clean'
        and entry.driver_pickup_trip_id = v_trip.id
        and coalesce(entry.done, false) = true
        and coalesce(entry.delivered, false) = false
    )
    and not exists (
      select 1
      from public.trip_stop_tasks task
      where task.stop_id = stop.id
        and task.task_type = 'pickup_dirty'
        and task.status = 'pending'
    );

  select count(*)
  into v_active
  from public.trip_stops
  where trip_id = v_trip.id and status = 'pending';

  if v_active = 0 then
    raise exception 'Plan jest pusty. Odbierz gotowe czyste albo dodaj punkt po brudne.';
  end if;

  v_result := public.driver_start_trip(
    p_session_token,
    p_trip_id,
    null,
    v_trip.car,
    v_trip.routes
  );
  if v_result->>'error' is not null then
    raise exception '%', v_result->>'error';
  end if;

  return v_result;
end;
$$;

create or replace function private.guard_active_clean_trip_task()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_done boolean;
  v_pickup_trip_id uuid;
begin
  if new.task_type not in ('pickup_clean', 'deliver_clean') then
    return new;
  end if;

  select trip.* into v_trip
  from public.trip_stops stop
  join public.driver_trips trip on trip.id = stop.trip_id
  where stop.id = new.stop_id;

  if v_trip.status not in ('active', 'handover') then
    return new;
  end if;

  select coalesce(done, false), driver_pickup_trip_id
  into v_done, v_pickup_trip_id
  from public.entries
  where id = new.entry_id;

  if not coalesce(v_done, false) or v_pickup_trip_id is distinct from v_trip.id then
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
    from public.entries entry
    where entry.client_name = new.client_name
      and entry.deleted_at is null
      and (
        (
          coalesce(entry.done, false) = true
          and coalesce(entry.delivered, false) = false
          and entry.driver_pickup_trip_id = v_trip.id
        )
        or private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date
      )
  ) then
    return new;
  end if;

  return null;
end;
$$;

grant execute on function public.driver_pickup_planned_clean(text, uuid, text[], boolean, text) to anon, authenticated;
grant execute on function public.driver_undo_planned_clean(text, uuid, text[]) to anon, authenticated;
grant execute on function public.driver_start_finalized_trip(text, uuid) to anon, authenticated;
