-- Dwufazowy start kierowcy: planned (mini-planowanie) → active (przejazd).

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
  v_trip_date date := coalesce(p_trip_date, (now() at time zone 'Europe/Warsaw')::date);
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

    if exists (
      select 1 from public.driver_trips
      where driver_id = v_user.id
        and trip_date = v_trip_date
        and status = 'planned'
    ) then
      return json_build_object('error', 'Masz już kurs w fazie planowania');
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

create or replace function public.driver_skip_planned_stop(
  p_session_token text,
  p_stop_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_stop public.trip_stops;
  v_trip public.driver_trips;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  select * into v_stop from public.trip_stops where id = p_stop_id for update;
  select * into v_trip from public.driver_trips where id = v_stop.trip_id;
  if v_stop.id is null or v_trip.id is null then return json_build_object('error', 'Nie znaleziono przystanku'); end if;
  if v_trip.status <> 'planned' then return json_build_object('error', 'Pomiń można tylko podczas planowania'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;
  if v_stop.status <> 'pending' then return json_build_object('error', 'Ten przystanek nie jest do pominięcia'); end if;

  update public.trip_stops
  set status = 'skipped',
      completed_at = now(),
      completed_by_user_id = v_user.id,
      completed_by_name = v_user.name,
      updated_at = now()
  where id = v_stop.id;

  update public.trip_stop_tasks
  set status = 'skipped', completed_at = now(), updated_at = now()
  where stop_id = v_stop.id and status = 'pending';

  insert into public.trip_events (trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (
    v_trip.id, v_stop.id, 'client_unavailable', v_user.id, v_user.name, v_user.role,
    'Pominięto podczas planowania: ' || v_stop.client_name,
    jsonb_build_object('reason', v_reason, 'phase', 'planning')
  );

  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.driver_unskip_planned_stop(
  p_session_token text,
  p_stop_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_stop public.trip_stops;
  v_trip public.driver_trips;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  select * into v_stop from public.trip_stops where id = p_stop_id for update;
  select * into v_trip from public.driver_trips where id = v_stop.trip_id;
  if v_stop.id is null or v_trip.id is null then return json_build_object('error', 'Nie znaleziono przystanku'); end if;
  if v_trip.status <> 'planned' then return json_build_object('error', 'Cofnięcie pominięcia tylko podczas planowania'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;
  if v_stop.status <> 'skipped' then return json_build_object('error', 'Ten przystanek nie jest pominięty'); end if;

  update public.trip_stops
  set status = 'pending', completed_at = null, completed_by_user_id = null, completed_by_name = null, updated_at = now()
  where id = v_stop.id returning * into v_stop;

  update public.trip_stop_tasks
  set status = 'pending', completed_at = null, updated_at = now()
  where stop_id = v_stop.id and status = 'skipped';

  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.driver_decline_clean_pickup(
  p_session_token text,
  p_trip_id uuid,
  p_client_name text,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_client_name text := nullif(trim(coalesce(p_client_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;
  if v_client_name is null then return json_build_object('error', 'Brak nazwy klienta'); end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_trip.status <> 'planned' then return json_build_object('error', 'Rezygnację można zapisać tylko podczas planowania'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;

  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (
    v_trip.id, 'declined_pickup', v_user.id, v_user.name, v_user.role,
    'Rezygnacja z odbioru czystego: ' || v_client_name,
    jsonb_build_object('client_name', v_client_name, 'reason', v_reason, 'phase', 'planning')
  );

  return json_build_object('ok', true);
end;
$$;

create or replace function public.driver_remove_trip_extra_client(
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
  v_user record;
  v_trip public.driver_trips;
  v_client_name text := nullif(trim(coalesce(p_client_name, '')), '');
  v_next_extra text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;
  if v_client_name is null then return json_build_object('error', 'Brak nazwy klienta'); end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_trip.status <> 'planned' then return json_build_object('error', 'Usuwanie dodatków tylko podczas planowania'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;

  select coalesce(json_agg(value order by value), '[]'::json)::text
  into v_next_extra
  from (
    select value
    from jsonb_array_elements_text(coalesce(nullif(v_trip.extra_clients, ''), '[]')::jsonb) as x(value)
    where value <> v_client_name
  ) filtered;

  update public.driver_trips
  set extra_clients = v_next_extra
  where id = p_trip_id
  returning * into v_trip;

  update public.trip_stops
  set status = 'skipped', completed_at = now(), completed_by_user_id = v_user.id,
      completed_by_name = v_user.name, updated_at = now()
  where trip_id = p_trip_id and client_name = v_client_name and status = 'pending';

  update public.trip_stop_tasks
  set status = 'skipped', completed_at = now(), updated_at = now()
  where stop_id in (
    select id from public.trip_stops
    where trip_id = p_trip_id and client_name = v_client_name
  ) and status = 'pending';

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.driver_cancel_trip(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_has_progress boolean;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then
    return json_build_object('error', 'To nie Twoja trasa');
  end if;
  if v_trip.status not in ('active', 'planned') then
    return json_build_object('error', 'Tę trasę nie można anulować');
  end if;

  if v_trip.status = 'active' then
    select exists (
      select 1
      from public.entries e
      where e.deleted_at is null
        and public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = v_trip.trip_date
        and (
          coalesce(v_trip.routes, '') = ''
          or e.route_id = any(string_to_array(v_trip.routes, ',')::int[])
          or (
            v_trip.extra_clients is not null
            and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
            and (v_trip.extra_clients::jsonb ? e.client_name)
          )
        )
        and (
          e.picked_by = v_trip.driver_name
          or e.delivered_by = v_trip.driver_name
        )
    ) into v_has_progress;

    if v_has_progress then
      return json_build_object('error', 'Nie można anulować trasy, na której są już odbiory lub dostawy');
    end if;
  end if;

  delete from public.driver_trips where id = p_trip_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.driver_skip_planned_stop(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_unskip_planned_stop(text, uuid) to anon, authenticated;
grant execute on function public.driver_decline_clean_pickup(text, uuid, text, text) to anon, authenticated;
grant execute on function public.driver_remove_trip_extra_client(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_cancel_trip(text, uuid) to anon, authenticated;
