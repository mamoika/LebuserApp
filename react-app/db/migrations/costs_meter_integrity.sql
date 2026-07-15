-- Protect cost data from invalid meter readings and order-dependent course approvals.

create or replace function private.greatest_meter_text(p_existing text, p_incoming numeric)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case
    when p_incoming is null then p_existing
    when p_existing is null or trim(p_existing) = '' then p_incoming::text
    when replace(trim(p_existing), ',', '.') ~ '^\d+(\.\d+)?$'
      and replace(trim(p_existing), ',', '.')::numeric > p_incoming then p_existing
    else p_incoming::text
  end;
$$;

create or replace function private.validate_daily_cost_row()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_meter text;
begin
  if new.entry_date !~ '^\d{4}-\d{2}-\d{2}$'
     or to_char(to_date(new.entry_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> new.entry_date then
    raise exception 'Nieprawidłowa data kosztu: %', new.entry_date using errcode = '22023';
  end if;

  foreach v_meter in array array[
    new.fiat_end, new.isuzu_end, new.merc_end, new.iveco_end,
    new.elec_end, new.gas_prod_end, new.gas_heat_end, new.water_end
  ] loop
    if v_meter is not null and trim(v_meter) <> ''
       and replace(trim(v_meter), ',', '.') !~ '^\d+(\.\d*)?$' then
      raise exception 'Nieprawidłowy stan licznika: %', v_meter using errcode = '22023';
    end if;
  end loop;

  if coalesce(new.ton_zd1, 0) < 0 or coalesce(new.ton_zd2, 0) < 0 or coalesce(new.ton_pralki, 0) < 0 then
    raise exception 'Tonaż nie może być ujemny' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_daily_cost_row on public.daily_costs;
create trigger validate_daily_cost_row
before insert or update on public.daily_costs
for each row execute function private.validate_daily_cost_row();

create or replace function private.validate_cost_settings_row()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Nieprawidłowy miesiąc kosztów: %', new.month_key using errcode = '22023';
  end if;
  if new.fiat_l_100km is null or new.fiat_l_100km < 0
     or new.isuzu_l_100km is null or new.isuzu_l_100km < 0
     or new.merc_l_100km is null or new.merc_l_100km < 0
     or new.iveco_l_100km is null or new.iveco_l_100km < 0
     or new.fuel_price is null or new.fuel_price < 0
     or new.elec_multiplier is null or new.elec_multiplier < 0
     or new.elec_fixed_monthly is null or new.elec_fixed_monthly < 0
     or new.elec_price_kwh is null or new.elec_price_kwh < 0
     or new.gas_prod_price_m3 is null or new.gas_prod_price_m3 < 0
     or new.gas_prod_fixed_daily is null or new.gas_prod_fixed_daily < 0
     or new.gas_heat_price_m3 is null or new.gas_heat_price_m3 < 0
     or new.gas_heat_fixed_monthly is null or new.gas_heat_fixed_monthly < 0
     or new.water_fixed_monthly is null or new.water_fixed_monthly < 0
     or new.water_price_m3 is null or new.water_price_m3 < 0
     or new.worker_hourly_rate is null or new.worker_hourly_rate < 0 then
    raise exception 'Wszystkie stawki kosztów muszą być nieujemnymi liczbami' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_cost_settings_row on public.cost_settings;
create trigger validate_cost_settings_row
before insert or update on public.cost_settings
for each row execute function private.validate_cost_settings_row();

create or replace function public.admin_approve_course_km(
  p_session_token text,
  p_trip_id uuid,
  p_end_km numeric,
  p_write_costs boolean default true
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_trip public.driver_trips;
  v_meter record;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_trip.status <> 'finished' then return json_build_object('error', 'Kurs nie jest zakończony'); end if;
  if p_end_km is null or p_end_km < 0 then return json_build_object('error', 'Nieprawidłowy licznik'); end if;

  update public.driver_trips
  set end_km = p_end_km, km_approval_status = 'approved', km_approved_at = now(),
      km_approved_by_user_id = v_admin.id, km_approved_by_name = v_admin.name
  where id = p_trip_id returning * into v_trip;

  if p_write_costs then
    insert into public.daily_costs (entry_date, updated_at, updated_by)
    values (v_trip.trip_date::text, now(), v_admin.name)
    on conflict (entry_date) do nothing;

    -- A course can contain several vehicle segments. Store every reported segment
    -- and keep the greatest odometer for a vehicle/day, independent of approval order.
    for v_meter in
      select s.car, s.end_km
      from public.trip_segments s
      where s.trip_id = p_trip_id and s.end_km is not null
      union all
      select v_trip.car, p_end_km
    loop
      update public.daily_costs
      set
        fiat_end = case when v_meter.car = 'fiat' then private.greatest_meter_text(fiat_end, v_meter.end_km) else fiat_end end,
        isuzu_end = case when v_meter.car = 'isuzu' then private.greatest_meter_text(isuzu_end, v_meter.end_km) else isuzu_end end,
        merc_end = case when v_meter.car = 'merc' then private.greatest_meter_text(merc_end, v_meter.end_km) else merc_end end,
        iveco_end = case when v_meter.car = 'iveco' then private.greatest_meter_text(iveco_end, v_meter.end_km) else iveco_end end,
        updated_at = now(),
        updated_by = v_admin.name
      where entry_date = v_trip.trip_date::text;
    end loop;
  end if;

  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (p_trip_id, 'kilometers_approved', v_admin.id, v_admin.name, v_admin.role,
          'Zatwierdzono licznik kursu', jsonb_build_object('end_km', p_end_km, 'written_to_costs', p_write_costs));
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.admin_approve_course_km(text, uuid, numeric, boolean) to anon, authenticated;

-- Explicit meter replacement/reset markers. A reset reading is the new baseline,
-- not consumption and not an invalid negative delta.
alter table public.daily_costs add column if not exists fiat_reset boolean not null default false;
alter table public.daily_costs add column if not exists isuzu_reset boolean not null default false;
alter table public.daily_costs add column if not exists merc_reset boolean not null default false;
alter table public.daily_costs add column if not exists iveco_reset boolean not null default false;
alter table public.daily_costs add column if not exists elec_reset boolean not null default false;
alter table public.daily_costs add column if not exists gas_prod_reset boolean not null default false;
alter table public.daily_costs add column if not exists gas_heat_reset boolean not null default false;
alter table public.daily_costs add column if not exists water_reset boolean not null default false;

-- Repair old vehicle readings from every approved trip and every recorded segment.
-- Existing higher manual readings are preserved.
with meter_sources as (
  select t.trip_date::text as entry_date, lower(s.car) as car, max(s.end_km) as end_km
  from public.trip_segments s
  join public.driver_trips t on t.id = s.trip_id
  where t.km_approval_status = 'approved' and s.end_km is not null
  group by t.trip_date::text, lower(s.car)
  union all
  select t.trip_date::text, lower(t.car), max(t.end_km)
  from public.driver_trips t
  where t.km_approval_status = 'approved' and t.end_km is not null
  group by t.trip_date::text, lower(t.car)
), dates as (
  select distinct entry_date from meter_sources
)
insert into public.daily_costs (entry_date, updated_at, updated_by)
select entry_date, now(), 'migration: costs meter repair' from dates
on conflict (entry_date) do nothing;

with meter_sources as (
  select entry_date, car, max(end_km) as end_km
  from (
    select t.trip_date::text as entry_date, lower(s.car) as car, s.end_km
    from public.trip_segments s
    join public.driver_trips t on t.id = s.trip_id
    where t.km_approval_status = 'approved' and s.end_km is not null
    union all
    select t.trip_date::text, lower(t.car), t.end_km
    from public.driver_trips t
    where t.km_approval_status = 'approved' and t.end_km is not null
  ) x
  group by entry_date, car
)
update public.daily_costs d
set
  fiat_end = private.greatest_meter_text(d.fiat_end, (select end_km from meter_sources where entry_date = d.entry_date and car = 'fiat')),
  isuzu_end = private.greatest_meter_text(d.isuzu_end, (select end_km from meter_sources where entry_date = d.entry_date and car = 'isuzu')),
  merc_end = private.greatest_meter_text(d.merc_end, (select end_km from meter_sources where entry_date = d.entry_date and car in ('merc', 'mercedes') order by end_km desc limit 1)),
  iveco_end = private.greatest_meter_text(d.iveco_end, (select end_km from meter_sources where entry_date = d.entry_date and car = 'iveco')),
  updated_at = now(),
  updated_by = 'migration: costs meter repair'
where exists (select 1 from meter_sources where entry_date = d.entry_date);

-- Optimistic locking: the frontend sends the updated_at value it originally read.
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
    gas_prod_price_m3 = case when r ? 'gas_prod_price_m3' then nullif(r->>'gas_prod_price_m3', '')::numeric else gas_prod_price_m3 end,
    gas_prod_fixed_daily = case when r ? 'gas_prod_fixed_daily' then nullif(r->>'gas_prod_fixed_daily', '')::numeric else gas_prod_fixed_daily end,
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
  v_existing public.daily_costs;
  v_saved public.daily_costs;
  v_expected timestamptz;
  v_result jsonb := '[]'::jsonb;
begin
  perform public.require_admin(p_session_token);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return json_build_object('error', 'Nieprawidłowa lista kosztów dziennych');
  end if;

  -- Validate every version first, so a multi-row save is all-or-nothing.
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
      insert into public.daily_costs (entry_date, updated_at)
      values (v_entry_date, now()) on conflict (entry_date) do nothing
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
      updated_at = now()
    where entry_date = v_entry_date returning * into v_saved;
    v_result := v_result || to_jsonb(v_saved);
  end loop;
  return v_result::json;
end;
$$;

grant execute on function public.admin_upsert_cost_settings(text, jsonb) to anon, authenticated;
grant execute on function public.admin_upsert_daily_costs(text, jsonb) to anon, authenticated;

-- Admin-facing audit of invalid/decreased readings and course-to-cost mismatches.
create or replace function public.get_costs_integrity_report(
  p_session_token text,
  p_from_date date default (current_date - interval '12 months')::date
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_result json;
begin
  perform public.require_admin(p_session_token);
  with readings as (
    select d.entry_date, v.meter, v.raw, v.is_reset,
      case when replace(trim(coalesce(v.raw, '')), ',', '.') ~ '^\d+(\.\d*)?$'
        then replace(trim(v.raw), ',', '.')::numeric end as reading
    from public.daily_costs d
    cross join lateral (values
      ('fiat', d.fiat_end, d.fiat_reset), ('isuzu', d.isuzu_end, d.isuzu_reset),
      ('merc', d.merc_end, d.merc_reset), ('iveco', d.iveco_end, d.iveco_reset),
      ('elec', d.elec_end, d.elec_reset), ('gas_prod', d.gas_prod_end, d.gas_prod_reset),
      ('gas_heat', d.gas_heat_end, d.gas_heat_reset), ('water', d.water_end, d.water_reset)
    ) v(meter, raw, is_reset)
    where d.entry_date >= p_from_date::text and nullif(trim(coalesce(v.raw, '')), '') is not null
  ), sequenced as (
    select *, lag(reading) over (partition by meter order by entry_date) as previous_reading from readings
  ), meter_issues as (
    select entry_date, meter,
      case when reading is null then 'invalid' else 'decreased_without_reset' end as issue,
      raw, previous_reading
    from sequenced
    where reading is null or (reading < previous_reading and not is_reset)
  ), expected as (
    select entry_date, car, max(end_km) end_km from (
      select t.trip_date::text entry_date, lower(s.car) car, s.end_km
      from public.trip_segments s join public.driver_trips t on t.id = s.trip_id
      where t.km_approval_status = 'approved' and s.end_km is not null and t.trip_date >= p_from_date
      union all
      select t.trip_date::text, lower(t.car), t.end_km from public.driver_trips t
      where t.km_approval_status = 'approved' and t.end_km is not null and t.trip_date >= p_from_date
    ) e group by entry_date, car
  ), course_issues as (
    select e.entry_date, e.car, e.end_km expected_end_km,
      case e.car when 'fiat' then d.fiat_end when 'isuzu' then d.isuzu_end
        when 'merc' then d.merc_end when 'mercedes' then d.merc_end when 'iveco' then d.iveco_end end actual_end_km
    from expected e left join public.daily_costs d on d.entry_date = e.entry_date
    where case e.car when 'fiat' then d.fiat_end when 'isuzu' then d.isuzu_end
      when 'merc' then d.merc_end when 'mercedes' then d.merc_end when 'iveco' then d.iveco_end end is null
  )
  select json_build_object(
    'ok', true,
    'meter_issue_count', (select count(*) from meter_issues),
    'meter_issues', coalesce((select json_agg(row_to_json(m)) from meter_issues m), '[]'::json),
    'course_issue_count', (select count(*) from course_issues),
    'course_issues', coalesce((select json_agg(row_to_json(c)) from course_issues c), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function public.get_costs_integrity_report(text, date) to anon, authenticated;

-- History must expose reset markers so closed-month aggregation remains correct.
create or replace function public.get_costs_history(
  p_session_token text,
  p_year integer,
  p_current_month_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_current_month_key text := trim(coalesce(p_current_month_key, ''));
  v_window_from date;
  v_current_start date;
  v_costs json;
  v_settings json;
  v_schedule json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;
  if p_year is null or v_current_month_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid history range' using errcode = '22023';
  end if;

  v_window_from := make_date(p_year - 1, 12, 1);
  v_current_start := to_date(v_current_month_key || '-01', 'YYYY-MM-DD');

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_costs from (
    select entry_date,
      fiat_end, fiat_reset, isuzu_end, isuzu_reset, merc_end, merc_reset, iveco_end, iveco_reset,
      elec_end, elec_reset, gas_prod_end, gas_prod_reset, gas_heat_end, gas_heat_reset,
      water_end, water_reset, other_costs, ton_zd1, ton_zd2, ton_pralki
    from public.daily_costs
    where entry_date >= to_char(v_window_from, 'YYYY-MM-DD')
      and entry_date < to_char(v_current_start, 'YYYY-MM-DD')
    order by entry_date
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_settings from (
    select * from public.cost_settings order by month_key
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_schedule from (
    select year, month, value from public.schedule_entries
    where year = p_year order by month, employee_id, day
  ) x;

  return json_build_object('ok', true, 'daily_costs', v_costs, 'settings', v_settings, 'schedule_entries', v_schedule);
end;
$$;

grant execute on function public.get_costs_history(text, integer, text) to anon, authenticated;
