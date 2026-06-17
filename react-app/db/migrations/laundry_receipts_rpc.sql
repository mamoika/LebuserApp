-- =====================================================================
-- Kartka prania jako trwały obiekt (DOWÓD przyjęcia i wydania bielizny)
-- ---------------------------------------------------------------------
-- Do tej pory kartka istniała tylko jako szablon do druku w aplikacji —
-- wpisane ilości sztuk nigdzie nie trafiały. Ta migracja dodaje trwały
-- rekord kartki: sekwencyjny numer dowodu, pozycje (JSONB z ilościami
-- przyjętymi/wydanymi) oraz status open/closed (przyjęcie -> wydanie).
--
-- Wzorowane na admin_driver_entries_clients_rpc.sql:
--   * zapisy wyłącznie przez RPC `security definer` ze strażnikiem sesji
--     require_driver(p_session_token) (dopuszcza role admin/driver),
--   * bezpośrednie insert/update/delete na tabeli są odebrane,
--   * odczyt bezpośrednim select (RLS dla authenticated), jak `entries`.
--
-- UWAGA: migracje w tym projekcie uruchamiamy ręcznie na Supabase.
-- Po wdrożeniu kodu wykonaj ten plik w bazie.
-- =====================================================================

-- Kolejny numer dowodu (NR). Edycja kartki nie zmienia raz nadanego numeru.
create sequence if not exists public.laundry_receipt_no_seq;

create table if not exists public.laundry_receipts (
  id            uuid primary key default gen_random_uuid(),
  doc_no        integer not null,
  client_name   text not null,
  address       text,
  entry_id      text,                         -- główny powiązany wpis (luźny, nullable)
  week_key      text,
  arrival       text,                         -- snapshoty napisów jak na kartce
  pickup        text,
  mode_label    text,
  sheets_kg     numeric,
  tablecloth_kg numeric,
  total_kg      numeric,
  items         jsonb not null default '[]',  -- [{name, accepted, issued, notes}]
  status        text not null default 'open', -- open (po przyjęciu) / closed (po wydaniu)
  created_by    text,
  created_at    timestamptz default now(),
  updated_by    text,
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

create index if not exists laundry_receipts_client_idx
  on public.laundry_receipts (client_name) where deleted_at is null;
create index if not exists laundry_receipts_entry_idx
  on public.laundry_receipts (entry_id) where deleted_at is null;

-- RLS: odczyt dla zalogowanych (jak entries); zapisy tylko przez RPC niżej.
alter table public.laundry_receipts enable row level security;
drop policy if exists "Dostęp dla zalogowanych do kartek" on public.laundry_receipts;
create policy "Dostęp dla zalogowanych do kartek"
  on public.laundry_receipts for all to authenticated using (true);

-- ---------------------------------------------------------------------
-- Zapis kartki (insert gdy p_id is null, w przeciwnym razie update).
-- Zwraca cały zapisany wiersz (front potrzebuje id oraz doc_no).
-- ---------------------------------------------------------------------
create or replace function public.admin_save_laundry_receipt(
  p_session_token text,
  p_id            uuid,
  p_entry_id      text,
  p_client_name   text,
  p_address       text,
  p_week_key      text,
  p_arrival       text,
  p_pickup        text,
  p_mode_label    text,
  p_sheets_kg     numeric,
  p_tablecloth_kg numeric,
  p_total_kg      numeric,
  p_items         jsonb,
  p_status        text,
  p_by            text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.laundry_receipts;
begin
  perform * from public.require_driver(p_session_token);

  if p_id is null then
    insert into public.laundry_receipts (
      doc_no, client_name, address, entry_id, week_key, arrival, pickup,
      mode_label, sheets_kg, tablecloth_kg, total_kg, items, status,
      created_by, updated_by
    ) values (
      nextval('public.laundry_receipt_no_seq'),
      p_client_name, p_address, p_entry_id, p_week_key, p_arrival, p_pickup,
      p_mode_label, p_sheets_kg, p_tablecloth_kg, p_total_kg,
      coalesce(p_items, '[]'::jsonb), coalesce(p_status, 'open'),
      p_by, p_by
    )
    returning * into v_row;
  else
    update public.laundry_receipts set
      client_name   = p_client_name,
      address       = p_address,
      entry_id      = p_entry_id,
      week_key      = p_week_key,
      arrival       = p_arrival,
      pickup        = p_pickup,
      mode_label    = p_mode_label,
      sheets_kg     = p_sheets_kg,
      tablecloth_kg = p_tablecloth_kg,
      total_kg      = p_total_kg,
      items         = coalesce(p_items, '[]'::jsonb),
      status        = coalesce(p_status, status),
      updated_by    = p_by,
      updated_at    = now()
    where id = p_id and deleted_at is null
    returning * into v_row;

    if v_row.id is null then
      return json_build_object('error', 'Nie znaleziono kartki');
    end if;
  end if;

  return json_build_object('ok', true, 'receipt', row_to_json(v_row));
end;
$$;

-- ---------------------------------------------------------------------
-- Soft delete kartki.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_laundry_receipt(
  p_session_token text,
  p_id            uuid,
  p_by            text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform * from public.require_driver(p_session_token);

  update public.laundry_receipts
    set deleted_at = now(), updated_by = p_by, updated_at = now()
    where id = p_id and deleted_at is null;

  if not found then
    return json_build_object('error', 'Nie znaleziono kartki');
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Granty: wykonanie RPC dla anon/authenticated, brak bezpośrednich zapisów.
grant execute on function public.admin_save_laundry_receipt(
  text, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, text, text
) to anon, authenticated;
grant execute on function public.admin_delete_laundry_receipt(text, uuid, text) to anon, authenticated;

grant select on table public.laundry_receipts to anon, authenticated;
revoke insert, update, delete on table public.laundry_receipts from anon, authenticated;
