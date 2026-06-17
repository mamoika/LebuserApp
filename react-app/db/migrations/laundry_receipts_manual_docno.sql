-- =====================================================================
-- Kartka prania: numer dowodu (NR) wpisywany ręcznie.
-- ---------------------------------------------------------------------
-- Wcześniej NR był nadawany automatycznie z sekwencji. Biuro wpisuje
-- jednak NR ręcznie (jak na papierowym druku), więc:
--   * doc_no staje się tekstem i może być NULL (do czasu wpisania),
--   * RPC zapisu przyjmuje p_doc_no i zapisuje wpisaną wartość,
--     bez korzystania z sekwencji.
-- Sekwencję zostawiamy (nieużywana, nieszkodliwa).
-- =====================================================================

alter table public.laundry_receipts alter column doc_no drop not null;
alter table public.laundry_receipts alter column doc_no type text using doc_no::text;

-- Zmiana sygnatury funkcji wymaga usunięcia starej wersji.
drop function if exists public.admin_save_laundry_receipt(
  text, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, text, text
);

create or replace function public.admin_save_laundry_receipt(
  p_session_token text,
  p_id            uuid,
  p_doc_no        text,
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
      nullif(btrim(coalesce(p_doc_no, '')), ''),
      p_client_name, p_address, p_entry_id, p_week_key, p_arrival, p_pickup,
      p_mode_label, p_sheets_kg, p_tablecloth_kg, p_total_kg,
      coalesce(p_items, '[]'::jsonb), coalesce(p_status, 'open'),
      p_by, p_by
    )
    returning * into v_row;
  else
    update public.laundry_receipts set
      doc_no        = nullif(btrim(coalesce(p_doc_no, '')), ''),
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

grant execute on function public.admin_save_laundry_receipt(
  text, uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, text, text
) to anon, authenticated;
