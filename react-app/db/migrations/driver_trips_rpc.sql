-- ============================================================
--  Driver trip writes through session-token RPCs.
--
--  Transitional migration: it adds protected RPCs but does not revoke direct
--  table privileges yet. After the frontend uses these functions in production,
--  a separate hardening migration can revoke insert/update/delete on
--  public.driver_trips from anon/authenticated.
-- ============================================================

create or replace function public.driver_set_trip_extra_clients(
  p_session_token text,
  p_trip_id uuid,
  p_extra_clients text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
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

  update public.driver_trips
  set extra_clients = coalesce(p_extra_clients, '[]')
  where id = p_trip_id
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
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
    set car = trim(coalesce(p_car, '')),
        routes = coalesce(p_routes, ''),
        status = 'active',
        started_at = now(),
        driver_id = coalesce(driver_id, v_user.id),
        driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
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
      coalesce(p_trip_date, (now() at time zone 'Europe/Warsaw')::date),
      trim(coalesce(p_car, '')),
      coalesce(p_routes, ''),
      'active',
      now()
    )
    returning * into v_trip;
  end if;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.admin_plan_driver_trip(
  p_session_token text,
  p_driver_id uuid,
  p_trip_date date,
  p_car text default null,
  p_routes text default '',
  p_extra_clients text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver_id uuid;
  v_driver_name text;
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);

  if p_trip_date is null then
    return json_build_object('error', 'Brak daty trasy');
  end if;

  if p_driver_id is not null then
    select id, name into v_driver_id, v_driver_name
    from public.users
    where id = p_driver_id
      and role in ('admin', 'driver');

    if v_driver_id is null then
      return json_build_object('error', 'Nie znaleziono kierowcy');
    end if;
  end if;

  insert into public.driver_trips (
    driver_id,
    driver_name,
    trip_date,
    car,
    routes,
    status,
    extra_clients
  )
  values (
    v_driver_id,
    v_driver_name,
    p_trip_date,
    trim(coalesce(p_car, '')),
    coalesce(p_routes, ''),
    'planned',
    p_extra_clients
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.driver_finish_trip(
  p_session_token text,
  p_trip_id uuid,
  p_end_km numeric
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
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
  if v_trip.status <> 'active' then
    return json_build_object('error', 'Tylko aktywną trasę można zakończyć');
  end if;
  if p_end_km is null then
    return json_build_object('error', 'Brak licznika końcowego');
  end if;

  update public.driver_trips
  set ended_at = now(),
      end_km = p_end_km,
      status = 'finished'
  where id = p_trip_id
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.driver_change_trip_car(
  p_session_token text,
  p_trip_id uuid,
  p_car text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
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
  if v_trip.status <> 'active' then
    return json_build_object('error', 'Auto można zmienić tylko na aktywnej trasie');
  end if;

  update public.driver_trips
  set car = trim(coalesce(p_car, ''))
  where id = p_trip_id
  returning * into v_trip;

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
  if v_trip.status <> 'active' then
    return json_build_object('error', 'Tylko aktywną trasę można anulować');
  end if;

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

  delete from public.driver_trips where id = p_trip_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_update_trip_end_km(
  p_session_token text,
  p_trip_id uuid,
  p_end_km numeric
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

  update public.driver_trips
  set end_km = p_end_km
  where id = p_trip_id
  returning * into v_trip;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.admin_delete_driver_trip(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_admin(p_session_token);

  delete from public.driver_trips where id = p_trip_id;
  if not found then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.driver_set_trip_extra_clients(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text) to anon, authenticated;
grant execute on function public.driver_finish_trip(text, uuid, numeric) to anon, authenticated;
grant execute on function public.driver_change_trip_car(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_cancel_trip(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_trip_end_km(text, uuid, numeric) to anon, authenticated;
grant execute on function public.admin_delete_driver_trip(text, uuid) to anon, authenticated;
