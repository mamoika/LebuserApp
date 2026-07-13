-- Administrator planuje kurs na tym samym ekranie co kierowca.
-- Operacje są wykonywane na wskazanym kursie i zapisują administratora w dzienniku.

begin;

create or replace function public.admin_pickup_planned_clean(
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
  v_admin record;
  v_trip public.driver_trips;
  v_requested integer;
  v_valid integer;
  v_affected integer;
  v_baskets integer;
  v_include_client text := nullif(trim(coalesce(p_include_client, '')), '');
  v_extra_clients jsonb;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;

  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;
  if v_trip.driver_id is null then return json_build_object('error', 'Najpierw przypisz kierowcę'); end if;
  if p_ids is null or array_length(p_ids, 1) is null then return json_build_object('error', 'Brak prania do odbioru'); end if;

  select count(distinct requested.entry_id) into v_requested
  from unnest(p_ids) as requested(entry_id);

  perform 1 from public.entries where id = any(p_ids) for update;

  if v_include_client is not null and exists (
    select 1 from public.entries where id = any(p_ids) and client_name is distinct from v_include_client
  ) then
    return json_build_object('error', 'Wybrane pranie należy do różnych klientów');
  end if;

  select count(distinct e.id) into v_valid
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
    return json_build_object('error', 'Lista gotowego prania zmieniła się. Odśwież plan i spróbuj ponownie.');
  end if;

  if v_include_client is not null then
    v_extra_clients := case
      when v_trip.extra_clients is not null and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
        then v_trip.extra_clients::jsonb
      else '[]'::jsonb
    end;
    if not (v_extra_clients ? v_include_client) then
      v_extra_clients := v_extra_clients || jsonb_build_array(v_include_client);
      update public.driver_trips set extra_clients = v_extra_clients::text where id = v_trip.id;
      v_trip.extra_clients := v_extra_clients::text;
    end if;
  end if;

  select greatest(1, count(distinct trim(trolley.value))) into v_baskets
  from public.entries e
  cross join lateral unnest(string_to_array(coalesce(nullif(e.laundry_trolley_no, ''), 'brak'), ',')) as trolley(value)
  where e.id = any(p_ids);

  update public.entries
  set done = true,
      picked_by = v_trip.driver_name,
      picked_at = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      picked_baskets = v_baskets,
      driver_pickup_trip_id = v_trip.id
  where id = any(p_ids) and coalesce(done, false) = false;

  get diagnostics v_affected = row_count;
  if v_affected <> v_requested then raise exception 'Nie udało się odebrać całego wybranego prania'; end if;

  if p_leave_trolley then
    update public.laundry_trolley_cycles
    set status = 'returned', returned_at = now(), returned_by = v_trip.driver_name, updated_at = now()
    where entry_ids && p_ids and returned_at is null;
    update public.entries set laundry_trolley_cycle_id = null where id = any(p_ids);
  else
    update public.laundry_trolley_cycles
    set status = 'released', released_at = coalesce(released_at, now()),
        released_by = coalesce(released_by, v_trip.driver_name), updated_at = now()
    where entry_ids && p_ids and returned_at is null;
  end if;

  perform private.sync_trip_course(v_trip.id);
  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (v_trip.id, 'laundry_pickup_completed', v_admin.id, v_admin.name, v_admin.role,
          'Administrator załadował czyste pranie do kursu', jsonb_build_object('entry_ids', p_ids, 'driver_name', v_trip.driver_name));

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

create or replace function public.admin_add_dirty_planned_stop(
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
  v_admin record;
  v_trip public.driver_trips;
  v_client public.clients;
  v_stop public.trip_stops;
  v_position integer;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;

  select * into v_client from public.clients where name = p_client_name limit 1;
  if v_client.id is null or not private.trip_includes_client(v_trip.routes, null, v_client.route_id, v_client.name) then
    return json_build_object('error', 'Klient nie należy do wybranych tras');
  end if;

  select * into v_stop from public.trip_stops
  where trip_id = v_trip.id and client_name = v_client.name limit 1;

  if v_stop.id is not null then
    update public.trip_stops
    set stop_kind = 'dirty_only', status = 'pending', completed_at = null,
        completed_by_user_id = null, completed_by_name = null, updated_at = now()
    where id = v_stop.id returning * into v_stop;
  else
    select coalesce(max(position), 0) + 1 into v_position from public.trip_stops where trip_id = v_trip.id;
    insert into public.trip_stops (trip_id, client_id, client_name, route_id, position, stop_kind, note)
    values (v_trip.id, v_client.id, v_client.name, v_client.route_id, v_position, 'dirty_only', v_client.note)
    returning * into v_stop;
  end if;

  perform private.sync_trip_course(v_trip.id);
  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (v_trip.id, 'dirty_stop_added', v_admin.id, v_admin.name, v_admin.role,
          'Administrator dodał punkt po brudne: ' || v_client.name, jsonb_build_object('client_name', v_client.name));
  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.admin_remove_dirty_planned_stop(
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
  v_admin record;
  v_trip public.driver_trips;
  v_removed integer;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;

  delete from public.trip_stops
  where trip_id = v_trip.id and client_name = p_client_name and stop_kind = 'dirty_only';
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
    values (v_trip.id, 'dirty_stop_removed', v_admin.id, v_admin.name, v_admin.role,
            'Administrator usunął punkt po brudne: ' || p_client_name, jsonb_build_object('client_name', p_client_name));
  end if;
  return json_build_object('ok', true, 'removed', v_removed);
end;
$$;

create or replace function public.admin_start_planned_course(
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
  v_active integer;
begin
  perform public.require_admin(p_session_token);
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;
  if v_trip.driver_id is null or nullif(trim(coalesce(v_trip.car, '')), '') is null then
    return json_build_object('error', 'Przypisz kierowcę i auto');
  end if;
  if exists (
    select 1 from public.driver_trips other
    where other.id <> v_trip.id and other.status in ('active', 'handover') and other.car = v_trip.car
  ) then
    return json_build_object('error', 'To auto jest już na trasie');
  end if;
  if exists (
    select 1 from public.driver_trips other
    where other.id <> v_trip.id and other.status in ('active', 'handover') and other.driver_id = v_trip.driver_id
  ) then
    return json_build_object('error', 'Ten kierowca ma już aktywny kurs');
  end if;

  perform private.sync_trip_course(v_trip.id);

  delete from public.trip_stop_tasks task
  using public.trip_stops stop, public.entries entry
  where task.stop_id = stop.id and task.entry_id = entry.id and stop.trip_id = v_trip.id
    and task.task_type in ('pickup_clean', 'deliver_clean')
    and entry.driver_pickup_trip_id is distinct from v_trip.id;

  update public.trip_stops stop
  set status = 'skipped', updated_at = now()
  where stop.trip_id = v_trip.id and stop.status = 'pending' and stop.stop_kind <> 'dirty_only'
    and not exists (
      select 1 from public.trip_stop_tasks task
      join public.entries entry on entry.id = task.entry_id
      where task.stop_id = stop.id and task.task_type = 'deliver_clean'
        and entry.driver_pickup_trip_id = v_trip.id
        and coalesce(entry.done, false) = true and coalesce(entry.delivered, false) = false
    )
    and not exists (
      select 1 from public.trip_stop_tasks task
      where task.stop_id = stop.id and task.task_type = 'pickup_dirty' and task.status = 'pending'
    );

  select count(*) into v_active from public.trip_stops where trip_id = v_trip.id and status = 'pending';
  if v_active = 0 then raise exception 'Plan jest pusty. Dodaj czyste albo punkt po brudne.'; end if;

  update public.driver_trips set status = 'active', started_at = now()
  where id = v_trip.id returning * into v_trip;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.admin_cancel_planned_course(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);
  select * into v_trip from public.driver_trips where id = p_trip_id and status = 'planned' for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono planowanego kursu'); end if;

  if exists (
    select 1 from public.entries
    where driver_pickup_trip_id = v_trip.id
      and coalesce(done, false) = true
      and coalesce(delivered, false) = false
  ) then
    return json_build_object('error', 'Najpierw cofnij cały załadunek czystego prania');
  end if;

  delete from public.driver_trips where id = v_trip.id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_pickup_planned_clean(text, uuid, text[], boolean, text) to anon, authenticated;
grant execute on function public.admin_undo_planned_clean(text, uuid, text[]) to anon, authenticated;
grant execute on function public.admin_add_dirty_planned_stop(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_remove_dirty_planned_stop(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_start_planned_course(text, uuid) to anon, authenticated;
grant execute on function public.admin_cancel_planned_course(text, uuid) to anon, authenticated;

commit;
