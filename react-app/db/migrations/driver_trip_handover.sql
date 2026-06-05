-- ============================================================
--  Przekazanie załadowanej trasy innemu kierowcy.
--  Kierowca odebrał pranie z pralni (done, picked_by=A, niedostarczone),
--  ale nie może jechać. Trasę można:
--   - przekazać wprost wskazanemu kierowcy (transfer),
--   - zostawić do przejęcia / pula (park, status 'handover'),
--   - przejąć z puli (claim).
--  Przepięcie picked_by w entries MUSI iść przez te RPC (security definer),
--  bo bezpośredni update entries jest odebrany anonowi.
--
--  URUCHOM w Supabase → SQL Editor. Idempotentne.
-- ============================================================

-- Status 'handover' = trasa załadowana, oddana do przejęcia.
alter table public.driver_trips drop constraint if exists driver_trips_status_check;
alter table public.driver_trips
  add constraint driver_trips_status_check
  check (status in ('planned', 'active', 'finished', 'handover'));

-- Lekka lista kierowców (id + imię) dla pickera przekazania. Każda ważna
-- sesja może ją pobrać — minimalny zakres (bez username/ról wrażliwych).
create or replace function public.list_drivers(p_session_token text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  return query
  select u.id, u.name, u.role
  from public.users u
  where u.role in ('admin', 'driver')
  order by u.name;
end;
$$;

-- Przepina picked_by załadowanych wpisów trasy ze starego kierowcy na nowego.
-- Ta sama logika identyfikacji wpisów co strażnik finiszu (lebuser_pickup_date).
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
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Przekazanie aktywnej, załadowanej trasy wprost wskazanemu kierowcy.
create or replace function public.transfer_loaded_trip(
  p_session_token text,
  p_trip_id uuid,
  p_target_driver_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
  v_trip public.driver_trips;
  v_target record;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_caller.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono trasy'); end if;
  if v_trip.status <> 'active' then return json_build_object('error', 'Tylko aktywną trasę można przekazać'); end if;
  if v_caller.role <> 'admin' and v_trip.driver_id <> v_caller.id then
    return json_build_object('error', 'To nie Twoja trasa');
  end if;

  select id, name, role into v_target from public.users where id = p_target_driver_id and role in ('admin', 'driver');
  if v_target.id is null then return json_build_object('error', 'Nie znaleziono kierowcy'); end if;
  if v_target.id = v_trip.driver_id then return json_build_object('error', 'To już ten kierowca'); end if;

  if exists (select 1 from public.driver_trips
             where driver_id = v_target.id and trip_date = v_trip.trip_date and status = 'active') then
    return json_build_object('error', v_target.name || ' ma już aktywną trasę');
  end if;

  perform public.reassign_loaded_entries(v_trip, v_trip.driver_name, v_target.name);

  update public.driver_trips
  set driver_id = v_target.id, driver_name = v_target.name, status = 'active'
  where id = p_trip_id;

  return json_build_object('ok', true, 'driver', v_target.name);
end;
$$;

-- Zostaw trasę do przejęcia (pula). Pranie zostaje przy dotychczasowym
-- kierowcy (picked_by) jako ślad; przejmujący przepnie je na siebie.
create or replace function public.park_loaded_trip(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
  v_trip public.driver_trips;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_caller.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono trasy'); end if;
  if v_trip.status <> 'active' then return json_build_object('error', 'Tylko aktywną trasę można zostawić'); end if;
  if v_caller.role <> 'admin' and v_trip.driver_id <> v_caller.id then
    return json_build_object('error', 'To nie Twoja trasa');
  end if;

  update public.driver_trips set status = 'handover' where id = p_trip_id;
  return json_build_object('ok', true);
end;
$$;

-- Przejmij trasę z puli (status handover). Przepina pranie na przejmującego.
create or replace function public.claim_loaded_trip(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
  v_trip public.driver_trips;
begin
  select * into v_caller from public.session_user(p_session_token) limit 1;
  if v_caller.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_caller.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono trasy'); end if;
  if v_trip.status <> 'handover' then return json_build_object('error', 'Ta trasa nie jest do przejęcia'); end if;

  if exists (select 1 from public.driver_trips
             where driver_id = v_caller.id and trip_date = v_trip.trip_date and status = 'active') then
    return json_build_object('error', 'Masz już aktywną trasę');
  end if;

  perform public.reassign_loaded_entries(v_trip, v_trip.driver_name, v_caller.name);

  update public.driver_trips
  set driver_id = v_caller.id, driver_name = v_caller.name, status = 'active'
  where id = p_trip_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.reassign_loaded_entries(public.driver_trips, text, text) from public;

grant execute on function public.list_drivers(text) to anon, authenticated;
grant execute on function public.transfer_loaded_trip(text, uuid, uuid) to anon, authenticated;
grant execute on function public.park_loaded_trip(text, uuid) to anon, authenticated;
grant execute on function public.claim_loaded_trip(text, uuid) to anon, authenticated;
