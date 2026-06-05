-- ============================================================
--  Admin writes for costs and app settings through session-token RPCs.
--
--  Transitional migration: it adds protected RPCs but does not revoke direct
--  table privileges yet. After the frontend uses these functions in production,
--  a separate hardening migration can revoke insert/update/delete on
--  public.daily_costs, public.cost_settings, and public.app_settings from
--  anon/authenticated.
-- ============================================================

create or replace function public.admin_upsert_app_setting(
  p_session_token text,
  p_key text,
  p_value jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_key, '')), '') is null then
    return json_build_object('error', 'Brak klucza ustawienia');
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (trim(p_key), coalesce(p_value, 'null'::jsonb), now())
  on conflict (key) do update set
    value = excluded.value,
    updated_at = excluded.updated_at;

  return json_build_object('ok', true);
end;
$$;

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
begin
  perform public.require_admin(p_session_token);

  if v_month_key is null then
    return json_build_object('error', 'Brak miesiąca ustawień kosztów');
  end if;

  insert into public.cost_settings (month_key, updated_at)
  values (v_month_key, now())
  on conflict (month_key) do nothing;

  update public.cost_settings
  set
    fiat_l_100km = case when r ? 'fiat_l_100km' then nullif(r->>'fiat_l_100km', '')::numeric else fiat_l_100km end,
    isuzu_l_100km = case when r ? 'isuzu_l_100km' then nullif(r->>'isuzu_l_100km', '')::numeric else isuzu_l_100km end,
    merc_l_100km = case when r ? 'merc_l_100km' then nullif(r->>'merc_l_100km', '')::numeric else merc_l_100km end,
    iveco_l_100km = case when r ? 'iveco_l_100km' then nullif(r->>'iveco_l_100km', '')::numeric else iveco_l_100km end,
    fuel_price = case when r ? 'fuel_price' then nullif(r->>'fuel_price', '')::numeric else fuel_price end,
    elec_multiplier = case when r ? 'elec_multiplier' then nullif(r->>'elec_multiplier', '')::numeric else elec_multiplier end,
    elec_fixed_monthly = case when r ? 'elec_fixed_monthly' then nullif(r->>'elec_fixed_monthly', '')::numeric else elec_fixed_monthly end,
    elec_price_kwh = case when r ? 'elec_price_kwh' then nullif(r->>'elec_price_kwh', '')::numeric else elec_price_kwh end,
    gas_prod_price_m3 = case when r ? 'gas_prod_price_m3' then nullif(r->>'gas_prod_price_m3', '')::numeric else gas_prod_price_m3 end,
    gas_prod_fixed_daily = case when r ? 'gas_prod_fixed_daily' then nullif(r->>'gas_prod_fixed_daily', '')::numeric else gas_prod_fixed_daily end,
    gas_heat_price_m3 = case when r ? 'gas_heat_price_m3' then nullif(r->>'gas_heat_price_m3', '')::numeric else gas_heat_price_m3 end,
    gas_heat_fixed_monthly = case when r ? 'gas_heat_fixed_monthly' then nullif(r->>'gas_heat_fixed_monthly', '')::numeric else gas_heat_fixed_monthly end,
    water_fixed_monthly = case when r ? 'water_fixed_monthly' then nullif(r->>'water_fixed_monthly', '')::numeric else water_fixed_monthly end,
    water_price_m3 = case when r ? 'water_price_m3' then nullif(r->>'water_price_m3', '')::numeric else water_price_m3 end,
    worker_hourly_rate = case when r ? 'worker_hourly_rate' then nullif(r->>'worker_hourly_rate', '')::numeric else worker_hourly_rate end,
    updated_at = now()
  where month_key = v_month_key;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_upsert_daily_costs(
  p_session_token text,
  p_rows jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
  v_entry_date text;
  v_count integer := 0;
begin
  perform public.require_admin(p_session_token);

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return json_build_object('error', 'Nieprawidłowa lista kosztów dziennych');
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_entry_date := nullif(trim(coalesce(r->>'entry_date', '')), '');
    if v_entry_date is null then
      return json_build_object('error', 'Brak daty kosztu dziennego');
    end if;

    insert into public.daily_costs (entry_date, updated_at)
    values (v_entry_date, now())
    on conflict (entry_date) do nothing;

    update public.daily_costs
    set
      fiat_start = case when r ? 'fiat_start' then nullif(r->>'fiat_start', '')::numeric else fiat_start end,
      fiat_end = case when r ? 'fiat_end' then nullif(r->>'fiat_end', '') else fiat_end end,
      isuzu_start = case when r ? 'isuzu_start' then nullif(r->>'isuzu_start', '')::numeric else isuzu_start end,
      isuzu_end = case when r ? 'isuzu_end' then nullif(r->>'isuzu_end', '') else isuzu_end end,
      merc_start = case when r ? 'merc_start' then nullif(r->>'merc_start', '')::numeric else merc_start end,
      merc_end = case when r ? 'merc_end' then nullif(r->>'merc_end', '') else merc_end end,
      iveco_start = case when r ? 'iveco_start' then nullif(r->>'iveco_start', '')::numeric else iveco_start end,
      iveco_end = case when r ? 'iveco_end' then nullif(r->>'iveco_end', '') else iveco_end end,
      elec_start = case when r ? 'elec_start' then nullif(r->>'elec_start', '')::numeric else elec_start end,
      elec_end = case when r ? 'elec_end' then nullif(r->>'elec_end', '') else elec_end end,
      gas_prod_start = case when r ? 'gas_prod_start' then nullif(r->>'gas_prod_start', '')::numeric else gas_prod_start end,
      gas_prod_end = case when r ? 'gas_prod_end' then nullif(r->>'gas_prod_end', '') else gas_prod_end end,
      gas_heat_start = case when r ? 'gas_heat_start' then nullif(r->>'gas_heat_start', '')::numeric else gas_heat_start end,
      gas_heat_end = case when r ? 'gas_heat_end' then nullif(r->>'gas_heat_end', '') else gas_heat_end end,
      water_start = case when r ? 'water_start' then nullif(r->>'water_start', '')::numeric else water_start end,
      water_end = case when r ? 'water_end' then nullif(r->>'water_end', '') else water_end end,
      other_costs = case when r ? 'other_costs' then nullif(r->>'other_costs', '')::numeric else other_costs end,
      ton_zd1 = case when r ? 'ton_zd1' then nullif(r->>'ton_zd1', '')::numeric else ton_zd1 end,
      ton_zd2 = case when r ? 'ton_zd2' then nullif(r->>'ton_zd2', '')::numeric else ton_zd2 end,
      ton_pralki = case when r ? 'ton_pralki' then nullif(r->>'ton_pralki', '')::numeric else ton_pralki end,
      updated_at = now()
    where entry_date = v_entry_date;

    v_count := v_count + 1;
  end loop;

  return json_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function public.admin_upsert_app_setting(text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_daily_costs(text, jsonb) to anon, authenticated;
