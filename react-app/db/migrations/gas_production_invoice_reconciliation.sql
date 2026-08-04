-- Uzgodnienie gazu produkcyjnego z fakturą.
-- Faktura podaje zużycie w kWh, podczas gdy licznik aplikacji jest prowadzony w m3.

alter table public.cost_settings
  add column if not exists gas_prod_invoice_kwh numeric,
  add column if not exists gas_prod_invoice_net numeric;

alter table public.cost_settings
  drop constraint if exists cost_settings_gas_prod_invoice_kwh_nonnegative,
  drop constraint if exists cost_settings_gas_prod_invoice_net_nonnegative;

alter table public.cost_settings
  add constraint cost_settings_gas_prod_invoice_kwh_nonnegative
    check (gas_prod_invoice_kwh is null or gas_prod_invoice_kwh >= 0),
  add constraint cost_settings_gas_prod_invoice_net_nonnegative
    check (gas_prod_invoice_net is null or gas_prod_invoice_net >= 0);

comment on column public.cost_settings.gas_prod_invoice_kwh is
  'Zużycie gazu produkcyjnego w kWh z faktury dla dokładnie tego miesiąca; nie podlega dziedziczeniu.';
comment on column public.cost_settings.gas_prod_invoice_net is
  'Łączna kwota netto faktury gazu produkcyjnego dla dokładnie tego miesiąca; nie podlega dziedziczeniu.';

create or replace function public.admin_upsert_cost_settings(
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
  v_existing public.cost_settings;
  v_saved public.cost_settings;
  v_expected timestamptz := nullif(r->>'expected_updated_at', '')::timestamptz;
begin
  perform public.require_admin(p_session_token);
  if v_month_key is null then return json_build_object('error', 'Brak miesiąca ustawień kosztów'); end if;

  select * into v_existing from public.cost_settings where month_key = v_month_key for update;
  if v_existing.month_key is not null and (v_expected is null or v_existing.updated_at is distinct from v_expected) then
    return json_build_object('error', 'CONCURRENT_MODIFICATION: stawki zostały zmienione przez innego użytkownika');
  end if;

  if v_existing.month_key is null then
    insert into public.cost_settings (month_key, updated_at)
    values (v_month_key, now())
    on conflict (month_key) do nothing
    returning * into v_saved;
    if v_saved.month_key is null then
      raise exception 'CONCURRENT_MODIFICATION: stawki zostały utworzone przez innego użytkownika';
    end if;
  end if;

  update public.cost_settings set
    fiat_l_100km = case when r ? 'fiat_l_100km' then nullif(r->>'fiat_l_100km', '')::numeric else fiat_l_100km end,
    isuzu_l_100km = case when r ? 'isuzu_l_100km' then nullif(r->>'isuzu_l_100km', '')::numeric else isuzu_l_100km end,
    merc_l_100km = case when r ? 'merc_l_100km' then nullif(r->>'merc_l_100km', '')::numeric else merc_l_100km end,
    iveco_l_100km = case when r ? 'iveco_l_100km' then nullif(r->>'iveco_l_100km', '')::numeric else iveco_l_100km end,
    fuel_price = case when r ? 'fuel_price' then nullif(r->>'fuel_price', '')::numeric else fuel_price end,
    elec_multiplier = case when r ? 'elec_multiplier' then nullif(r->>'elec_multiplier', '')::numeric else elec_multiplier end,
    elec_fixed_monthly = case when r ? 'elec_fixed_monthly' then nullif(r->>'elec_fixed_monthly', '')::numeric else elec_fixed_monthly end,
    elec_price_kwh = case when r ? 'elec_price_kwh' then nullif(r->>'elec_price_kwh', '')::numeric else elec_price_kwh end,
    elec_power_fee_monthly = case when r ? 'elec_power_fee_monthly' then nullif(r->>'elec_power_fee_monthly', '')::numeric else elec_power_fee_monthly end,
    elec_reactive_monthly = case when r ? 'elec_reactive_monthly' then nullif(r->>'elec_reactive_monthly', '')::numeric else elec_reactive_monthly end,
    elec_invoice_kwh = case when r ? 'elec_invoice_kwh' then nullif(r->>'elec_invoice_kwh', '')::numeric else elec_invoice_kwh end,
    elec_invoice_net = case when r ? 'elec_invoice_net' then nullif(r->>'elec_invoice_net', '')::numeric else elec_invoice_net end,
    gas_prod_price_m3 = case when r ? 'gas_prod_price_m3' then nullif(r->>'gas_prod_price_m3', '')::numeric else gas_prod_price_m3 end,
    gas_prod_fixed_daily = case when r ? 'gas_prod_fixed_daily' then nullif(r->>'gas_prod_fixed_daily', '')::numeric else gas_prod_fixed_daily end,
    gas_prod_invoice_kwh = case when r ? 'gas_prod_invoice_kwh' then nullif(r->>'gas_prod_invoice_kwh', '')::numeric else gas_prod_invoice_kwh end,
    gas_prod_invoice_net = case when r ? 'gas_prod_invoice_net' then nullif(r->>'gas_prod_invoice_net', '')::numeric else gas_prod_invoice_net end,
    gas_heat_price_m3 = case when r ? 'gas_heat_price_m3' then nullif(r->>'gas_heat_price_m3', '')::numeric else gas_heat_price_m3 end,
    gas_heat_fixed_monthly = case when r ? 'gas_heat_fixed_monthly' then nullif(r->>'gas_heat_fixed_monthly', '')::numeric else gas_heat_fixed_monthly end,
    water_fixed_monthly = case when r ? 'water_fixed_monthly' then nullif(r->>'water_fixed_monthly', '')::numeric else water_fixed_monthly end,
    water_price_m3 = case when r ? 'water_price_m3' then nullif(r->>'water_price_m3', '')::numeric else water_price_m3 end,
    worker_hourly_rate = case when r ? 'worker_hourly_rate' then nullif(r->>'worker_hourly_rate', '')::numeric else worker_hourly_rate end,
    updated_at = now()
  where month_key = v_month_key
  returning * into v_saved;

  return row_to_json(v_saved);
end;
$$;

revoke execute on function public.admin_upsert_cost_settings(text, jsonb) from public;
grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;

-- Wartości netto są sumą pozycji faktury, bez VAT i bez doliczania wykazanej
-- informacyjnie kwoty akcyzy (jest już zawarta w rozliczeniu sprzedawcy).
update public.cost_settings
set
  gas_prod_fixed_daily = 173.508,
  gas_prod_invoice_kwh = 79575,
  gas_prod_invoice_net = 26751.80
where month_key = '2026-05';

update public.cost_settings
set
  gas_prod_fixed_daily = 173.508,
  gas_prod_invoice_kwh = 95698,
  gas_prod_invoice_net = 29858.96
where month_key = '2026-06';
