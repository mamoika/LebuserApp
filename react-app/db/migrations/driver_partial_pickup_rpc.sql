-- ============================================================
--  Partial laundry pickup: split a clean pickup by kilograms.
--  Allows a driver to take e.g. 100 kg from a 312 kg stop while the
--  remaining kilograms stay visible for another pickup.
-- ============================================================

alter table public.entries add column if not exists delivered boolean default false;
alter table public.entries add column if not exists delivered_by text;
alter table public.entries add column if not exists delivered_at timestamptz;
alter table public.entries add column if not exists delivered_baskets integer;
alter table public.entries add column if not exists picked_baskets integer;
alter table public.entries add column if not exists driver_note text;
alter table public.entries add column if not exists weighed_kg numeric;
alter table public.entries add column if not exists washed boolean default false;
alter table public.entries add column if not exists washed_at timestamptz;
alter table public.entries add column if not exists washed_by text;
alter table public.entries add column if not exists deleted_at timestamptz;

drop function if exists public.driver_pickup_entries_partial(text, text[], numeric, integer);

create or replace function public.driver_pickup_entries_partial(
  p_session_token text,
  p_ids text[],
  p_pickup_kg numeric,
  p_baskets integer default 1,
  p_remaining_pick_date date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_entry record;
  v_remaining numeric := p_pickup_kg;
  v_total numeric := 0;
  v_affected integer := 0;
  v_new_id text;
  v_remaining_pick_day integer;
  v_remaining_pick_week_key text;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  if p_pickup_kg is null or p_pickup_kg <= 0 then
    return json_build_object('error', 'Podaj wagę większą od 0 kg');
  end if;

  select coalesce(sum(coalesce(weight, 0)), 0)
    into v_total
  from public.entries
  where id = any(p_ids)
    and done = false
    and deleted_at is null;

  if v_total <= 0 then
    return json_build_object('error', 'Ten punkt nie ma wagi do podziału');
  end if;

  if p_remaining_pick_date is not null then
    v_remaining_pick_day := extract(isodow from p_remaining_pick_date)::integer;
    if v_remaining_pick_day < 1 or v_remaining_pick_day > 5 then
      return json_build_object('error', 'Resztę można przenieść tylko na dzień roboczy');
    end if;
    v_remaining_pick_week_key := to_char(date_trunc('week', p_remaining_pick_date)::date, 'YYYY-MM-DD');
  end if;

  if p_pickup_kg >= v_total then
    update public.entries set
      done           = true,
      picked_by      = v_driver.name,
      picked_at      = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      picked_baskets = greatest(0, coalesce(p_baskets, 1))
    where id = any(p_ids)
      and done = false
      and deleted_at is null;

    get diagnostics v_affected = row_count;
    return json_build_object('ok', true, 'affected', v_affected, 'picked_kg', v_total, 'remaining_kg', 0);
  end if;

  for v_entry in
    select *
    from public.entries
    where id = any(p_ids)
      and done = false
      and deleted_at is null
      and coalesce(weight, 0) > 0
    order by added_at nulls last, id
  loop
    exit when v_remaining <= 0;

    if v_remaining >= coalesce(v_entry.weight, 0) then
      update public.entries set
        done           = true,
        picked_by      = v_driver.name,
        picked_at      = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        picked_baskets = greatest(0, coalesce(p_baskets, 1))
      where id = v_entry.id;

      v_remaining := v_remaining - coalesce(v_entry.weight, 0);
      v_affected := v_affected + 1;
    else
      v_new_id := 'ID_' || replace(gen_random_uuid()::text, '-', '');

      insert into public.entries (
        id, week_key, client_name, arr_day, pick_day, done, added_at,
        pick_week_key, weight, route_id, type, added_by, picked_by, picked_at,
        comment, urgent, sort_order, delivered, delivered_by, delivered_at,
        delivered_baskets, picked_baskets, driver_note, weighed_kg, washed,
        washed_at, washed_by
      )
      values (
        v_new_id, v_entry.week_key, v_entry.client_name, v_entry.arr_day,
        v_entry.pick_day, true, v_entry.added_at, v_entry.pick_week_key,
        v_remaining, v_entry.route_id, v_entry.type, v_entry.added_by,
        v_driver.name, to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        v_entry.comment, v_entry.urgent, v_entry.sort_order, false, null, null,
        null, greatest(0, coalesce(p_baskets, 1)), v_entry.driver_note,
        null, v_entry.washed, v_entry.washed_at, v_entry.washed_by
      );

      update public.entries
      set weight = coalesce(v_entry.weight, 0) - v_remaining
      where id = v_entry.id;

      v_affected := v_affected + 1;
      v_remaining := 0;
    end if;
  end loop;

  if p_remaining_pick_date is not null then
    update public.entries
    set pick_day = v_remaining_pick_day,
        pick_week_key = v_remaining_pick_week_key
    where id = any(p_ids)
      and done = false
      and deleted_at is null;
  end if;

  return json_build_object(
    'ok', true,
    'affected', v_affected,
    'picked_kg', p_pickup_kg,
    'remaining_kg', greatest(0, v_total - p_pickup_kg),
    'remaining_pick_date', p_remaining_pick_date
  );
end;
$$;

grant execute on function public.driver_pickup_entries_partial(text, text[], numeric, integer, date) to anon, authenticated;
