-- Thomas Müller może edytować koszty bez pełnej roli administratora.
-- Każdy zapis przechodzi przez modułowo ograniczone RPC, a istniejące
-- triggery audytowe zapisują autora oraz wartości przed i po zmianie.

begin;

create or replace function private.max_module_access(
  p_user_id uuid,
  p_role text,
  p_module text
)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(trim(app_user.username)) = 'muller'
      and p_module in ('work_schedule', 'costs')
      then 2::smallint
    else private.default_module_access(p_role, p_module)
  end
  from public.users app_user
  where app_user.id = p_user_id;
$$;

insert into public.user_module_permissions (
  user_id, module, access_level, base_role, updated_at, updated_by
)
select id, 'costs', 2, role, now(), null
from public.users
where lower(trim(username)) = 'muller'
on conflict (user_id, module) do update
set access_level = excluded.access_level,
    base_role = excluded.base_role,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

create or replace function private.require_module_editor(
  p_session_token text,
  p_module text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if private.user_module_access(v_user.id, p_module) < 2 then
    raise exception 'Module edit access required' using errcode = '42501';
  end if;
  return v_user.id;
end;
$$;

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
    updated_at = now(),
    updated_by = v_actor_name
  where month_key = v_month_key
  returning * into v_saved;

  return row_to_json(v_saved);
end;
$$;

create or replace function public.admin_upsert_daily_costs(
  p_session_token text,
  p_rows jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_entry_date text;
  v_existing public.daily_costs;
  v_saved public.daily_costs;
  v_expected timestamptz;
  v_result jsonb := '[]'::jsonb;
  v_actor_name text;
begin
  perform private.require_module_editor(p_session_token, 'costs');
  v_actor_name := coalesce(nullif(current_setting('app.audit_user_name', true), ''), 'System');
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return json_build_object('error', 'Nieprawidłowa lista kosztów dziennych');
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_entry_date := nullif(trim(coalesce(r->>'entry_date', '')), '');
    if v_entry_date is null then return json_build_object('error', 'Brak daty kosztu dziennego'); end if;
    v_expected := nullif(r->>'expected_updated_at', '')::timestamptz;
    select * into v_existing from public.daily_costs where entry_date = v_entry_date for update;
    if v_existing.entry_date is not null and (v_expected is null or v_existing.updated_at is distinct from v_expected) then
      return json_build_object('error', 'CONCURRENT_MODIFICATION: koszt dzienny został zmieniony przez innego użytkownika (' || v_entry_date || ')');
    end if;
  end loop;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_entry_date := trim(r->>'entry_date');
    v_expected := nullif(r->>'expected_updated_at', '')::timestamptz;
    if v_expected is null then
      v_saved := null;
      insert into public.daily_costs (entry_date, updated_at, updated_by)
      values (v_entry_date, now(), v_actor_name)
      on conflict (entry_date) do nothing
      returning * into v_saved;
      if v_saved.entry_date is null then
        raise exception 'CONCURRENT_MODIFICATION: koszt dzienny został utworzony przez innego użytkownika (%)', v_entry_date;
      end if;
    end if;
    update public.daily_costs set
      fiat_end = case when r ? 'fiat_end' then nullif(r->>'fiat_end', '') else fiat_end end,
      isuzu_end = case when r ? 'isuzu_end' then nullif(r->>'isuzu_end', '') else isuzu_end end,
      merc_end = case when r ? 'merc_end' then nullif(r->>'merc_end', '') else merc_end end,
      iveco_end = case when r ? 'iveco_end' then nullif(r->>'iveco_end', '') else iveco_end end,
      elec_end = case when r ? 'elec_end' then nullif(r->>'elec_end', '') else elec_end end,
      gas_prod_end = case when r ? 'gas_prod_end' then nullif(r->>'gas_prod_end', '') else gas_prod_end end,
      gas_heat_end = case when r ? 'gas_heat_end' then nullif(r->>'gas_heat_end', '') else gas_heat_end end,
      water_end = case when r ? 'water_end' then nullif(r->>'water_end', '') else water_end end,
      fiat_reset = case when r ? 'fiat_reset' then coalesce((r->>'fiat_reset')::boolean, false) else fiat_reset end,
      isuzu_reset = case when r ? 'isuzu_reset' then coalesce((r->>'isuzu_reset')::boolean, false) else isuzu_reset end,
      merc_reset = case when r ? 'merc_reset' then coalesce((r->>'merc_reset')::boolean, false) else merc_reset end,
      iveco_reset = case when r ? 'iveco_reset' then coalesce((r->>'iveco_reset')::boolean, false) else iveco_reset end,
      elec_reset = case when r ? 'elec_reset' then coalesce((r->>'elec_reset')::boolean, false) else elec_reset end,
      gas_prod_reset = case when r ? 'gas_prod_reset' then coalesce((r->>'gas_prod_reset')::boolean, false) else gas_prod_reset end,
      gas_heat_reset = case when r ? 'gas_heat_reset' then coalesce((r->>'gas_heat_reset')::boolean, false) else gas_heat_reset end,
      water_reset = case when r ? 'water_reset' then coalesce((r->>'water_reset')::boolean, false) else water_reset end,
      other_costs = case when r ? 'other_costs' then nullif(r->>'other_costs', '')::numeric else other_costs end,
      ton_zd1 = case when r ? 'ton_zd1' then nullif(r->>'ton_zd1', '')::numeric else ton_zd1 end,
      ton_zd2 = case when r ? 'ton_zd2' then nullif(r->>'ton_zd2', '')::numeric else ton_zd2 end,
      ton_pralki = case when r ? 'ton_pralki' then nullif(r->>'ton_pralki', '')::numeric else ton_pralki end,
      updated_at = now(),
      updated_by = v_actor_name
    where entry_date = v_entry_date
    returning * into v_saved;
    v_result := v_result || to_jsonb(v_saved);
  end loop;
  return v_result::json;
end;
$$;

create or replace function public.save_costs_performance_progi(
  p_session_token text,
  p_month_key text,
  p_value jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_key text := trim(coalesce(p_month_key, ''));
  v_key text;
begin
  perform private.require_module_editor(p_session_token, 'costs');
  if v_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    return json_build_object('error', 'Nieprawidłowy miesiąc progów wydajności');
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return json_build_object('error', 'Nieprawidłowe progi wydajności');
  end if;

  v_key := 'performance_progi_' || v_month_key;
  insert into public.app_settings (key, value, updated_at)
  values (v_key, p_value, now())
  on conflict (key) do update set
    value = excluded.value,
    updated_at = excluded.updated_at;

  return json_build_object('ok', true, 'key', v_key);
end;
$$;

revoke all on function private.max_module_access(uuid, text, text) from public, anon, authenticated;
revoke all on function private.require_module_editor(text, text) from public, anon, authenticated;
revoke all on function public.admin_upsert_cost_settings_legacy(text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_upsert_cost_settings(text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_upsert_daily_costs(text, jsonb) from public, anon, authenticated;
revoke all on function public.save_costs_performance_progi(text, text, jsonb) from public, anon, authenticated;

grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_daily_costs(text, jsonb) to anon, authenticated;
grant execute on function public.save_costs_performance_progi(text, text, jsonb) to anon, authenticated;

commit;
