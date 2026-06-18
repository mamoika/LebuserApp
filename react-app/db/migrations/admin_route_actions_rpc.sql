-- =====================================================================
-- Akcje trasy „na żywo" wykonywane przez ADMINA bez logowania jako kierowca.
-- ---------------------------------------------------------------------
-- Standardowe driver_* RPC stempluja akcję na osobę, która kliknęła, i
-- pilnują własności (dostarczyć może tylko ten, kto odebrał). Admin chce
-- móc „dopchnąć" cudzą trasę z widoku Trasy na żywo. Te funkcje:
--   * są dozwolone WYŁĄCZNIE dla roli admin (istniejący require_admin),
--   * stemplują odbiór/dostawę na PRZYPISANEGO KIEROWCĘ trasy (p_driver_name),
--     a nie na admina — żeby audyt i statystyki pozostały spójne,
--   * pomijają blokadę „picked_by = ja" (override administracyjny).
-- require_admin(text) już istnieje w bazie (używany przez inne admin_* RPC),
-- więc go NIE redefiniujemy — tylko wywołujemy.
-- =====================================================================

-- 1) Odbiór z pralni w imieniu kierowcy trasy
create or replace function public.admin_pickup_entries(
  p_session_token text,
  p_ids           text[],
  p_driver_name   text,
  p_baskets       integer default 1
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_affected integer;
begin
  perform public.require_admin(p_session_token);
  v_name := nullif(btrim(coalesce(p_driver_name, '')), '');
  if v_name is null then
    select name into v_name from public.session_user(p_session_token) limit 1;
  end if;

  update public.entries set
    done           = true,
    picked_by      = v_name,
    picked_at      = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    picked_baskets = greatest(0, coalesce(p_baskets, 1))
  where id = any(p_ids) and done = false;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- 2) Dostawa do klienta w imieniu kierowcy trasy (bez blokady picked_by = ja)
create or replace function public.admin_deliver_entries(
  p_session_token text,
  p_ids           text[],
  p_driver_name   text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_affected integer;
begin
  perform public.require_admin(p_session_token);
  v_name := nullif(btrim(coalesce(p_driver_name, '')), '');
  if v_name is null then
    select name into v_name from public.session_user(p_session_token) limit 1;
  end if;

  update public.entries set
    delivered    = true,
    delivered_by = v_name,
    delivered_at = now()
  where id = any(p_ids) and done = true;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- 3) Cofnij dostawę (override admina)
create or replace function public.admin_undo_deliver(
  p_session_token text,
  p_ids           text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer;
begin
  perform public.require_admin(p_session_token);

  update public.entries set
    delivered    = false,
    delivered_by = null,
    delivered_at = null
  where id = any(p_ids);

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

-- 4) Cofnij odbiór z pralni (tylko gdy nie ma już dostawy)
create or replace function public.admin_undo_pickup(
  p_session_token text,
  p_ids           text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer;
begin
  perform public.require_admin(p_session_token);

  update public.entries set
    done           = false,
    picked_by      = null,
    picked_at      = null,
    picked_baskets = null
  where id = any(p_ids) and delivered = false;

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

grant execute on function public.admin_pickup_entries(text, text[], text, integer) to anon, authenticated;
grant execute on function public.admin_deliver_entries(text, text[], text) to anon, authenticated;
grant execute on function public.admin_undo_deliver(text, text[]) to anon, authenticated;
grant execute on function public.admin_undo_pickup(text, text[]) to anon, authenticated;
