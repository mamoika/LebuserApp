-- Gaz produkcyjny: użytkownik wpisuje Vb, a aplikacja wylicza kWh.
-- Dane startowe pochodzą z faktury Elenger za 01–30.06.2026.

alter table public.cost_settings
  add column if not exists gas_prod_kwh_per_m3 numeric not null default 11.258588235294118
    check (gas_prod_kwh_per_m3 > 0),
  add column if not exists gas_prod_price_kwh numeric not null default 0.25762
    check (gas_prod_price_kwh >= 0),
  add column if not exists gas_prod_fixed_monthly numeric not null default 5205.24
    check (gas_prod_fixed_monthly >= 0);

-- Zachowujemy dotychczasową procedurę zapisu wszystkich starych stawek,
-- a nowy wrapper zapisuje dodatkowo trzy pola gazowe.
alter function public.admin_upsert_cost_settings(text, jsonb)
  rename to admin_upsert_cost_settings_legacy;

create function public.admin_upsert_cost_settings(
  p_session_token text,
  p_settings jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb := coalesce(p_settings, '{}'::jsonb);
  v_month_key text := nullif(trim(coalesce(r->>'month_key', '')), '');
  v_result json;
  v_saved public.cost_settings;
begin
  v_result := public.admin_upsert_cost_settings_legacy(p_session_token, r);
  if (v_result::jsonb) ? 'error' then return v_result; end if;

  update public.cost_settings set
    gas_prod_kwh_per_m3 = case when r ? 'gas_prod_kwh_per_m3' then nullif(r->>'gas_prod_kwh_per_m3', '')::numeric else gas_prod_kwh_per_m3 end,
    gas_prod_price_kwh = case when r ? 'gas_prod_price_kwh' then nullif(r->>'gas_prod_price_kwh', '')::numeric else gas_prod_price_kwh end,
    gas_prod_fixed_monthly = case when r ? 'gas_prod_fixed_monthly' then nullif(r->>'gas_prod_fixed_monthly', '')::numeric else gas_prod_fixed_monthly end,
    updated_at = now()
  where month_key = v_month_key
  returning * into v_saved;

  return row_to_json(v_saved);
end;
$$;

grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
