-- ============================================================
--  Entries + clients writes through RPC (admin + driver paths).
--
--  entries to maszyna stanów dla DWÓCH aktorów:
--   - admin posiada cykl życia wpisu (dodanie/edycja/odbiór/wyprane/usunięcie),
--   - kierowca posiada przejścia realizacji (odbiór z pralni ↔ dostawa, cofnięcia)
--     ze strażnikami własności (picked_by = ja) przeniesionymi tu, na serwer.
--
--  Decyzje:
--   1. wiernie — driver-RPC NIE sprawdza tras kierowcy (zachowujemy dzisiejszą swobodę),
--      pilnujemy tylko własności akcji.
--   2. notatka klienta od kierowcy tylko gdy ma dziś aktywną trasę (status='active').
--   3. revoke w tej samej migracji (nikt nie pracuje w trakcie wdrożenia).
--
--  URUCHOM w Supabase → SQL Editor. Idempotentne.
-- ============================================================

-- ---------- helper: ważna sesja kierowcy (lub admina) ----------
create or replace function public.require_driver(p_session_token text)
returns table(id uuid, name text, routes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  id := v_user.id;
  name := v_user.name;
  routes := v_user.routes;
  return next;
end;
$$;

revoke all on function public.require_driver(text) from public;


-- ============================================================
--  ŚCIEŻKA ADMINA (require_admin)
-- ============================================================

-- Dodanie wpisu (zachowuje klienckie tekstowe id 'ID_...').
create or replace function public.admin_insert_entry(
  p_session_token text,
  p_id text,
  p_week_key text,
  p_client_name text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_type text,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false,
  p_added_by text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  if nullif(trim(coalesce(p_id, '')), '') is null then
    return json_build_object('error', 'Brak id wpisu');
  end if;
  if nullif(trim(coalesce(p_client_name, '')), '') is null then
    return json_build_object('error', 'Brak klienta');
  end if;

  insert into public.entries
    (id, week_key, client_name, arr_day, pick_day, pick_week_key,
     weight, route_id, type, trolleys, added_by, urgent)
  values
    (p_id, p_week_key, p_client_name, p_arr_day, p_pick_day, p_pick_week_key,
     p_weight, p_route_id, coalesce(p_type, 'P'), coalesce(p_trolleys, 1),
     nullif(trim(coalesce(p_added_by, '')), ''), coalesce(p_urgent, false));

  return json_build_object('ok', true, 'id', p_id);
end;
$$;

-- Edycja wpisu (pola z formularza edycji).
create or replace function public.admin_update_entry(
  p_session_token text,
  p_id text,
  p_client_name text,
  p_type text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  update public.entries set
    client_name   = p_client_name,
    type          = p_type,
    arr_day       = p_arr_day,
    pick_day      = p_pick_day,
    pick_week_key = p_pick_week_key,
    route_id      = p_route_id,
    weight        = p_weight,
    trolleys      = coalesce(p_trolleys, 1),
    urgent        = coalesce(p_urgent, false)
  where id = p_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Toggle „wyprane" (prywatny status, nie rusza odbioru/dostawy).
create or replace function public.admin_set_entry_washed(
  p_session_token text,
  p_id text,
  p_washed boolean,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  update public.entries set
    washed    = coalesce(p_washed, false),
    washed_at = case when p_washed then now() else null end,
    washed_by = case when p_washed then nullif(trim(coalesce(p_by, '')), '') else null end
  where id = p_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Batch odbiór (done) — z panelu admina.
create or replace function public.admin_set_entries_done(
  p_session_token text,
  p_ids text[],
  p_done boolean,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer;
begin
  perform * from public.require_driver(p_session_token);

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów');
  end if;

  update public.entries set
    done      = coalesce(p_done, false),
    picked_by = case when p_done then nullif(trim(coalesce(p_by, '')), '') else null end,
    picked_at = case when p_done
                     then to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                     else null end
  where id = any(p_ids);

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- Soft-delete wpisu z panelu (zostaje w historii).
create or replace function public.admin_soft_delete_entry(
  p_session_token text,
  p_id text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  update public.entries set
    deleted_at = now(),
    deleted_by = nullif(trim(coalesce(p_by, '')), '')
  where id = p_id and deleted_at is null;

  if not found then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Dodanie klienta.
create or replace function public.admin_insert_client(
  p_session_token text,
  p_name text,
  p_route_id integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Brak nazwy klienta');
  end if;

  insert into public.clients (name, route_id, sort_order)
  values (trim(p_name), p_route_id, 9999);

  return json_build_object('ok', true);
end;
$$;

-- Edycja klienta + kaskada client_name/route_id w otwartych entries.
create or replace function public.admin_update_client(
  p_session_token text,
  p_id uuid,
  p_name text,
  p_route_id integer,
  p_lat numeric default null,
  p_lng numeric default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  perform public.require_admin(p_session_token);

  select name, route_id into v_old from public.clients where id = p_id;
  if v_old is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;

  update public.clients set
    name       = trim(p_name),
    route_id   = p_route_id,
    lat        = p_lat,
    lng        = p_lng,
    sort_order = case when p_route_id is distinct from v_old.route_id then 9999 else sort_order end
  where id = p_id;

  -- Kaskada: client_name w entries, gdy nazwa się zmieniła.
  if trim(p_name) is distinct from v_old.name then
    update public.entries set client_name = trim(p_name) where client_name = v_old.name;
  end if;

  -- Otwarte wpisy muszą podążać za aktualną trasą klienta, inaczej kierowca
  -- widzi klienta na starej trasie po przeniesieniu.
  if p_route_id is distinct from v_old.route_id then
    update public.entries
    set route_id = p_route_id
    where client_name = trim(p_name)
      and deleted_at is null
      and (
        coalesce(done, false) = false
        or coalesce(delivered, false) = false
      );
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Usunięcie klienta (blokada, gdy ma historię wpisów).
create or replace function public.admin_delete_client(
  p_session_token text,
  p_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform public.require_admin(p_session_token);

  select name into v_name from public.clients where id = p_id;
  if v_name is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;

  if exists (select 1 from public.entries where client_name = v_name limit 1) then
    return json_build_object('error', 'Nie można usunąć klienta — ma historię wpisów');
  end if;

  delete from public.clients where id = p_id;
  return json_build_object('ok', true);
end;
$$;

-- Zmiana kolejności / przypisania tras klientów (drag-drop) — batch.
-- p_updates: jsonb array [{ "id": uuid, "route_id": int, "sort_order": int }, ...]
create or replace function public.admin_reorder_clients(
  p_session_token text,
  p_updates jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_client_name text;
begin
  perform public.require_admin(p_session_token);

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    return json_build_object('error', 'Nieprawidłowe dane kolejności');
  end if;

  for v_row in select * from jsonb_array_elements(p_updates)
  loop
    select name into v_client_name
    from public.clients
    where id = (v_row->>'id')::uuid;

    update public.clients set
      route_id   = (v_row->>'route_id')::integer,
      sort_order = (v_row->>'sort_order')::integer
    where id = (v_row->>'id')::uuid;

    update public.entries
    set route_id = (v_row->>'route_id')::integer
    where client_name = v_client_name
      and deleted_at is null
      and (
        coalesce(done, false) = false
        or coalesce(delivered, false) = false
      );
  end loop;

  return json_build_object('ok', true);
end;
$$;

-- Notatka klienta z panelu admina (bez warunku trasy).
create or replace function public.admin_set_client_note(
  p_session_token text,
  p_name text,
  p_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  update public.clients set note = nullif(p_note, '') where name = p_name;
  return json_build_object('ok', true);
end;
$$;


-- ============================================================
--  ŚCIEŻKA KIEROWCY (require_driver) — strażnicy własności na serwerze
-- ============================================================

-- 1) Odbiór czystego z pralni — tylko jeśli jeszcze nie odebrany (done=false).
create or replace function public.driver_pickup_entries(
  p_session_token text,
  p_ids text[],
  p_baskets integer default 1
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_affected integer;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    done           = true,
    picked_by      = v_driver.name,
    picked_at      = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    picked_baskets = greatest(0, coalesce(p_baskets, 1))
  where id = any(p_ids) and done = false;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- 2) Dostawa do klienta — tylko jeśli odebrał TEN kierowca i jest done.
create or replace function public.driver_deliver_entries(
  p_session_token text,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_affected integer;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    delivered    = true,
    delivered_by = v_driver.name,
    delivered_at = now()
  where id = any(p_ids) and picked_by = v_driver.name and done = true;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- Cofnij dostawę — tylko własną.
create or replace function public.driver_undo_deliver(
  p_session_token text,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_affected integer;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    delivered    = false,
    delivered_by = null,
    delivered_at = null
  where id = any(p_ids) and delivered_by = v_driver.name;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- Cofnij odbiór z pralni — tylko własny.
create or replace function public.driver_undo_pickup(
  p_session_token text,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_affected integer;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    done           = false,
    picked_by      = null,
    picked_at      = null,
    picked_baskets = null
  where id = any(p_ids) and picked_by = v_driver.name;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- Soft-delete wpisu (np. cofnięcie przyjazdu brudnego).
create or replace function public.driver_soft_delete_entry(
  p_session_token text,
  p_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    deleted_at = now(),
    deleted_by = v_driver.name
  where id = p_id and deleted_at is null;

  if not found then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Notatka klienta od kierowcy — tylko gdy ma dziś aktywną trasę.
create or replace function public.driver_set_client_note(
  p_session_token text,
  p_name text,
  p_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  if not exists (
    select 1 from public.driver_trips
    where driver_id = v_driver.id
      and trip_date = (now() at time zone 'Europe/Warsaw')::date
      and status = 'active'
  ) then
    return json_build_object('error', 'Notatkę można zapisać tylko podczas aktywnej trasy');
  end if;

  update public.clients set note = nullif(p_note, '') where name = p_name;
  return json_build_object('ok', true);
end;
$$;


-- ============================================================
--  Granty + odebranie bezpośredniego DML
-- ============================================================
grant execute on function public.admin_insert_entry(text, text, text, text, integer, integer, text, integer, text, numeric, integer, boolean, text) to anon, authenticated;
grant execute on function public.admin_update_entry(text, text, text, text, integer, integer, text, integer, numeric, integer, boolean) to anon, authenticated;
grant execute on function public.admin_set_entry_washed(text, text, boolean, text) to anon, authenticated;
grant execute on function public.admin_set_entries_done(text, text[], boolean, text) to anon, authenticated;
grant execute on function public.admin_soft_delete_entry(text, text, text) to anon, authenticated;
grant execute on function public.admin_insert_client(text, text, integer) to anon, authenticated;
grant execute on function public.admin_reorder_clients(text, jsonb) to anon, authenticated;
grant execute on function public.admin_update_client(text, uuid, text, integer, numeric, numeric) to anon, authenticated;
grant execute on function public.admin_delete_client(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_client_note(text, text, text) to anon, authenticated;

grant execute on function public.driver_pickup_entries(text, text[], integer) to anon, authenticated;
grant execute on function public.driver_deliver_entries(text, text[]) to anon, authenticated;
grant execute on function public.driver_undo_deliver(text, text[]) to anon, authenticated;
grant execute on function public.driver_undo_pickup(text, text[]) to anon, authenticated;
grant execute on function public.driver_soft_delete_entry(text, text) to anon, authenticated;
grant execute on function public.driver_set_client_note(text, text, text) to anon, authenticated;

revoke insert, update, delete on table public.entries from anon, authenticated;
revoke insert, update, delete on table public.clients from anon, authenticated;
