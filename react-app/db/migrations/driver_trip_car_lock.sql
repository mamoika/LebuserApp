-- Blokada: jedno auto nie może być jednocześnie na dwóch aktywnych trasach.
-- Egzekwowane po stronie serwera w driver_start_trip i driver_change_trip_car,
-- niezależnie od blokady w UI (ochrona przed wyścigiem/obejściem).
-- Uruchom w Supabase (SQL editor) po wdrożeniu front-endu.

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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  -- Auto już na aktywnej trasie innego kierowcy → odmowa.
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
    set car = v_car,
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
      v_car,
      coalesce(p_routes, ''),
      'active',
      now()
    )
    returning * into v_trip;
  end if;

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
  v_car text := trim(coalesce(p_car, ''));
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

  -- Nowe auto nie może być na innej aktywnej trasie.
  if v_car <> '' and exists (
    select 1 from public.driver_trips
    where status = 'active'
      and car = v_car
      and id <> p_trip_id
  ) then
    return json_build_object('error', 'To auto jest już na trasie u innego kierowcy');
  end if;

  update public.driver_trips
  set car = v_car
  where id = p_trip_id
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.driver_change_trip_car(text, uuid, text) to anon, authenticated;
