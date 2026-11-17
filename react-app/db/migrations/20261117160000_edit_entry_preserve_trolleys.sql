begin;

-- Korekta danych wpisu (np. samej wagi netto) nie może ponownie rezerwować
-- wózków, które już należą do tego wpisu. Walidujemy wyłącznie numery dodane
-- podczas edycji; niezmieniony zestaw omija także trigger rezerwacji.
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
  p_urgent boolean default false,
  p_arrival_trolley_nos text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_existing public.entries;
  v_resolved json;
  v_trolleys integer;
  v_nos text;
  v_existing_nos text;
  v_added_nos text;
  v_net numeric;
begin
  select * into v_user from public.require_driver(p_session_token) limit 1;

  select * into v_existing
  from public.entries
  where id = p_id
  for update;
  if v_existing.id is null then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  select nullif(array_to_string(array_agg(value order by value), ', '), '')
  into v_nos
  from (
    select distinct trim(raw_value) as value
    from unnest(string_to_array(coalesce(p_arrival_trolley_nos, ''), ',')) raw_value
    where nullif(trim(raw_value), '') is not null
  ) normalized;

  select nullif(array_to_string(array_agg(value order by value), ', '), '')
  into v_existing_nos
  from (
    select distinct trim(raw_value) as value
    from unnest(string_to_array(coalesce(v_existing.arrival_trolley_nos, ''), ',')) raw_value
    where nullif(trim(raw_value), '') is not null
  ) normalized;

  v_trolleys := case
    when v_nos is not null then cardinality(string_to_array(v_nos, ','))
    else coalesce(p_trolleys, 0)
  end;
  v_net := case when p_weight is null then null else round(greatest(0, p_weight), 2) end;

  if v_nos is not distinct from v_existing_nos
     and p_client_name is not distinct from v_existing.client_name then
    update public.entries set
      type = p_type,
      arr_day = p_arr_day,
      pick_day = p_pick_day,
      pick_week_key = p_pick_week_key,
      route_id = p_route_id,
      weight = v_net,
      arrival_gross_kg = null,
      arrival_tare_kg = null,
      trolleys = v_trolleys,
      urgent = coalesce(p_urgent, false)
    where id = p_id;
  else
    select nullif(array_to_string(array_agg(value order by value), ', '), '')
    into v_added_nos
    from (
      select trim(raw_value) as value
      from unnest(string_to_array(coalesce(v_nos, ''), ',')) raw_value
      where nullif(trim(raw_value), '') is not null
      except
      select trim(raw_value) as value
      from unnest(string_to_array(coalesce(v_existing.arrival_trolley_nos, ''), ',')) raw_value
      where nullif(trim(raw_value), '') is not null
    ) added;

    v_resolved := public.resolve_arrival_trolleys(p_client_name, v_added_nos, v_user.name);
    if v_resolved->>'error' is not null then return v_resolved; end if;

    update public.entries set
      client_name = p_client_name,
      type = p_type,
      arr_day = p_arr_day,
      pick_day = p_pick_day,
      pick_week_key = p_pick_week_key,
      route_id = p_route_id,
      weight = v_net,
      arrival_gross_kg = null,
      arrival_tare_kg = null,
      trolleys = v_trolleys,
      arrival_trolley_nos = v_nos,
      urgent = coalesce(p_urgent, false)
    where id = p_id;
  end if;

  return json_build_object('ok', true, 'net_kg', v_net);
end;
$$;

commit;
