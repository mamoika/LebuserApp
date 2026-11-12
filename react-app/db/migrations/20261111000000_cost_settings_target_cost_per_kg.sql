-- Add target_cost_per_kg to cost_settings and update admin_upsert_cost_settings
alter table public.cost_settings add column if not exists target_cost_per_kg numeric;

create or replace function public.admin_upsert_cost_settings(
  p_session_token text,
  p_settings jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_settings, '{}'::jsonb);
  v_month_key text := nullif(trim(coalesce(r->>'month_key', '')), '');
  v_existing public.cost_settings;
  v_saved public.cost_settings;
  v_expected timestamptz := nullif(r->>'expected_updated_at', '')::timestamptz;
  v_actor_name text;
begin
  perform private.require_module_editor(p_session_token, 'costs');
  v_actor_name := coalesce(nullif(current_setting('app.audit_user_name', true), ''), 'System');
  if v_month_key is null then return json_build_object('error', 'Brak miesiąca ustawień kosztów'); end if;

  select * into v_existing from public.cost_settings where month_key = v_month_key for update;
  if v_existing.month_key is not null and (v_expected is null or v_existing.updated_at is distinct from v_expected) then
    return json_build_object('error', 'CONCURRENT_MODIFICATION: stawki zostały zmienione przez innego użytkownika');
  end if;

  if v_existing.month_key is null then
    insert into public.cost_settings (month_key, updated_at, updated_by)
    values (v_month_key, now(), v_actor_name)
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
    gas_prod_kwh_per_m3 = case when r ? 'gas_prod_kwh_per_m3' then nullif(r->>'gas_prod_kwh_per_m3', '')::numeric else gas_prod_kwh_per_m3 end,
    gas_prod_price_kwh = case when r ? 'gas_prod_price_kwh' then nullif(r->>'gas_prod_price_kwh', '')::numeric else gas_prod_price_kwh end,
    gas_prod_fixed_monthly = case when r ? 'gas_prod_fixed_monthly' then nullif(r->>'gas_prod_fixed_monthly', '')::numeric else gas_prod_fixed_monthly end,
    gas_heat_price_m3 = case when r ? 'gas_heat_price_m3' then nullif(r->>'gas_heat_price_m3', '')::numeric else gas_heat_price_m3 end,
    gas_heat_fixed_monthly = case when r ? 'gas_heat_fixed_monthly' then nullif(r->>'gas_heat_fixed_monthly', '')::numeric else gas_heat_fixed_monthly end,
    water_fixed_monthly = case when r ? 'water_fixed_monthly' then nullif(r->>'water_fixed_monthly', '')::numeric else water_fixed_monthly end,
    water_price_m3 = case when r ? 'water_price_m3' then nullif(r->>'water_price_m3', '')::numeric else water_price_m3 end,
    worker_hourly_rate = case when r ? 'worker_hourly_rate' then nullif(r->>'worker_hourly_rate', '')::numeric else worker_hourly_rate end,
    target_cost_per_kg = case when r ? 'target_cost_per_kg' then nullif(r->>'target_cost_per_kg', '')::numeric else target_cost_per_kg end,
    updated_at = now(),
    updated_by = v_actor_name
  where month_key = v_month_key
  returning * into v_saved;

  return row_to_json(v_saved);
end;
$$;

revoke all on function public.admin_upsert_cost_settings(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
