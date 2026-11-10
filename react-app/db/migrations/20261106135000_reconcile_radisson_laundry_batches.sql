begin;

do $$
declare
  v_previous_ids constant text[] := array[
    'ID_mw1vvzpz7x8hji',
    'ID_mw1vvtniuma5vc',
    'ID_mw1vvd3przllq0'
  ];
  v_today_ids constant text[] := array[
    'ID_mw3bj3ossm22ci',
    'ID_mw3bip0t2a63re',
    'ID_mw3bhygcq4ez0i'
  ];
  v_previous_washed_at constant timestamptz := timestamptz '2026-11-05 12:00:00+01';
  v_picked_at timestamptz := now();
  v_cycle_id uuid;
  v_trip_id uuid;
begin
  if (
    select count(*) = 3 and coalesce(sum(weight), 0) = 267
    from public.entries
    where id = any(v_previous_ids)
      and client_name = 'Radisson'
      and deleted_at is null
  ) is not true then
    raise exception 'Nie znaleziono kompletnej partii Radisson 267 kg';
  end if;

  if (
    select count(*) = 3 and coalesce(sum(weight), 0) = 385
    from public.entries
    where id = any(v_today_ids)
      and client_name = 'Radisson'
      and deleted_at is null
  ) is not true then
    raise exception 'Nie znaleziono kompletnej partii Radisson 385 kg';
  end if;

  select trip.id
  into v_trip_id
  from public.driver_trips trip
  where trip.trip_date = date '2026-11-06'
    and trip.driver_name = 'Patryk Rudczuk'
    and trip.status in ('planned', 'active')
    and exists (
      select 1
      from public.trip_stops stop
      where stop.trip_id = trip.id
        and stop.client_name = 'Radisson'
    )
  order by trip.started_at desc nulls last
  limit 1;

  if v_trip_id is null then
    raise exception 'Nie znaleziono aktywnego kursu Patryka z Radissonem na 2026-11-06';
  end if;

  update public.entries
  set washed = true,
      washed_at = v_previous_washed_at,
      washed_by = 'Korekta administracyjna',
      laundry_status = 'packed',
      laundry_packed_at = v_previous_washed_at,
      laundry_packed_by = 'Korekta administracyjna',
      laundry_ready_at = v_previous_washed_at,
      laundry_trolley_no = 'brak'
  where id = any(v_previous_ids)
    and deleted_at is null;

  select cycle.id
  into v_cycle_id
  from public.laundry_trolley_cycles cycle
  where cycle.client_name = 'Radisson'
    and cycle.entry_ids @> v_previous_ids
  order by cycle.created_at desc
  limit 1;

  if v_cycle_id is null then
    insert into public.laundry_trolley_cycles (
      trolley_no,
      client_name,
      entry_ids,
      total_kg,
      status,
      packed_by,
      packed_at,
      notes,
      load_kind
    ) values (
      'brak',
      'Radisson',
      v_previous_ids,
      267,
      'packed',
      'Korekta administracyjna',
      v_previous_washed_at,
      'Korekta procesu: pranie wykonane 2026-11-05, dokładna godzina nieznana.',
      'laundry'
    )
    returning id into v_cycle_id;
  end if;

  update public.laundry_trolley_cycles
  set status = 'released',
      released_by = 'Patryk Rudczuk',
      released_at = coalesce(released_at, v_picked_at),
      updated_at = now()
  where id = v_cycle_id;

  update public.entries
  set laundry_status = 'released',
      laundry_trolley_cycle_id = v_cycle_id,
      done = true,
      picked_by = 'Patryk Rudczuk',
      picked_at = to_char(v_picked_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      picked_baskets = 1,
      driver_pickup_trip_id = v_trip_id
  where id = any(v_previous_ids)
    and deleted_at is null;

  update public.entries
  set washed = true,
      washed_at = coalesce(washed_at, now()),
      washed_by = coalesce(washed_by, 'Korekta administracyjna'),
      laundry_status = case
        when laundry_packed_at is not null or laundry_ready_at is not null then 'packed'
        else 'washed'
      end
  where id = any(v_today_ids)
    and deleted_at is null
    and coalesce(done, false) = false;

  insert into public.logs (
    user_name,
    action,
    target_id,
    details,
    client_name,
    entry_id,
    category,
    entity_type,
    entity_id,
    metadata
  )
  select
    'Korekta administracyjna',
    'laundry_batch_reconciled',
    entry.id,
    case
      when entry.id = any(v_previous_ids)
        then '267 kg: wyprane 05.11, wydane kierowcy 06.11; godzina prania umowna.'
      else '385 kg: fizycznie wyprane 06.11, planowany wyjazd 09.11.'
    end,
    entry.client_name,
    entry.id,
    'laundry',
    'laundry_entry',
    entry.id,
    jsonb_build_object(
      'correction', true,
      'batch_kg', case when entry.id = any(v_previous_ids) then 267 else 385 end,
      'wash_date', case when entry.id = any(v_previous_ids) then '2026-11-05' else '2026-11-06' end,
      'departure_date', case when entry.id = any(v_previous_ids) then '2026-11-06' else '2026-11-09' end
    )
  from public.entries entry
  where entry.id = any(v_previous_ids || v_today_ids)
    and not exists (
      select 1
      from public.logs existing
      where existing.entry_id = entry.id
        and existing.action = 'laundry_batch_reconciled'
    );
end;
$$;

commit;
