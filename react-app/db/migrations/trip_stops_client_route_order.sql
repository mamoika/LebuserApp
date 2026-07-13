-- Kurs zawsze dziedziczy kolejność z „Klienci i Trasy”.
-- Rodzaj zadania (czyste / brudne / oba) nie wpływa na pozycję klienta.

begin;

create or replace function private.resequence_trip_stops(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_offset integer;
begin
  if not exists (
    select 1
    from public.driver_trips
    where id = p_trip_id and status in ('planned', 'active', 'handover')
  ) or not exists (select 1 from public.trip_stops where trip_id = p_trip_id) then
    return;
  end if;

  -- Najpierw przenieś wszystkie pozycje poza docelowy zakres, aby nie naruszyć
  -- unique(trip_id, position) podczas zamiany np. pozycji 1 i 2.
  select coalesce(max(position), 0) + count(*)::integer + 1000
  into v_offset
  from public.trip_stops
  where trip_id = p_trip_id;

  update public.trip_stops
  set position = position + v_offset
  where trip_id = p_trip_id;

  with ranked as (
    select
      stop.id,
      row_number() over (
        order by
          coalesce(route.sort_order, 2147483647),
          coalesce(client.sort_order, 2147483647),
          stop.position,
          stop.client_name,
          stop.id
      )::integer as next_position
    from public.trip_stops stop
    left join public.clients client
      on client.id = stop.client_id or (stop.client_id is null and client.name = stop.client_name)
    left join public.routes route on route.id = coalesce(client.route_id, stop.route_id)
    where stop.trip_id = p_trip_id
  )
  update public.trip_stops stop
  set position = ranked.next_position,
      updated_at = now()
  from ranked
  where stop.id = ranked.id;
end;
$$;

revoke execute on function private.resequence_trip_stops(uuid) from public, anon, authenticated;

create or replace function private.sync_trip_course(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_max_position integer;
begin
  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return; end if;

  select coalesce(max(position), 0) into v_max_position
  from public.trip_stops where trip_id = p_trip_id;

  insert into public.trip_stops (
    trip_id, client_id, client_name, route_id, position, stop_kind, note
  )
  select
    v_trip.id,
    c.id,
    work.client_name,
    coalesce(c.route_id, work.route_id),
    v_max_position + row_number() over (
      order by coalesce(r.sort_order, 9999), coalesce(c.sort_order, 9999), work.client_name
    ),
    case
      when v_trip.extra_clients is not null
       and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
       and v_trip.extra_clients::jsonb ? work.client_name then 'extra'
      else 'client'
    end,
    c.note
  from (
    select e.client_name, min(e.route_id) as route_id
    from public.entries e
    where e.deleted_at is null
      and private.trip_includes_client(v_trip.routes, v_trip.extra_clients, e.route_id, e.client_name)
      and (
        public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = v_trip.trip_date
        or (
          public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) < v_trip.trip_date
          and coalesce(e.delivered, false) = false
        )
        or private.entry_arrival_date(e.week_key, e.arr_day) = v_trip.trip_date
        or (
          e.picked_by = v_trip.driver_name
          and e.picked_at ~ '^\d{4}-\d{2}-\d{2}'
          and (e.picked_at::timestamptz at time zone 'Europe/Warsaw')::date = v_trip.trip_date
        )
        or (e.delivered_by = v_trip.driver_name and (e.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date)
      )
    group by e.client_name
  ) work
  left join public.clients c on c.name = work.client_name
  left join public.routes r on r.id = coalesce(c.route_id, work.route_id)
  where not exists (
    select 1 from public.trip_stops existing
    where existing.trip_id = v_trip.id and existing.client_name = work.client_name
  );

  update public.trip_stops s
  set client_id = coalesce(s.client_id, c.id),
      route_id = coalesce(c.route_id, s.route_id),
      note = c.note,
      updated_at = now()
  from public.clients c
  where s.trip_id = v_trip.id and c.name = s.client_name;

  insert into public.trip_stop_tasks (
    stop_id, entry_id, task_type, quantity, unit, status, metadata, completed_at
  )
  select s.id, e.id, task.task_type,
         case when task.task_type = 'pickup_dirty' then coalesce(e.weight, e.trolleys::numeric) else e.weight end,
         case when e.weight is not null then 'kg' else 'wózki' end,
         case
           when task.task_type = 'pickup_clean' and e.done then 'completed'
           when task.task_type = 'deliver_clean' and e.delivered then 'completed'
           else 'pending'
         end,
         jsonb_build_object(
           'entry_type', coalesce(e.type, 'P'),
           'trolleys', coalesce(e.trolleys, 1),
           'picked_baskets', e.picked_baskets,
           'trolley_cycle_id', e.laundry_trolley_cycle_id,
           'trolley_no', e.laundry_trolley_no,
           'laundry_status', e.laundry_status,
           'urgent', coalesce(e.urgent, false)
         ),
         case
           when task.task_type = 'pickup_clean' and e.done then coalesce(
             case when e.picked_at ~ '^\d{4}-\d{2}-\d{2}' then e.picked_at::timestamptz else null end,
             now()
           )
           when task.task_type = 'deliver_clean' and e.delivered then coalesce(e.delivered_at, now())
           else null
         end
  from public.trip_stops s
  join public.entries e on e.client_name = s.client_name and e.deleted_at is null
  cross join lateral (
    select 'pickup_clean'::text as task_type
    where public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = v_trip.trip_date
        or coalesce(e.delivered, false) = false
        or (e.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'deliver_clean'::text
    where public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = v_trip.trip_date
        or coalesce(e.delivered, false) = false
        or (e.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'pickup_dirty'::text
    where private.entry_arrival_date(e.week_key, e.arr_day) = v_trip.trip_date
  ) task
  where s.trip_id = v_trip.id
    and private.trip_includes_client(v_trip.routes, v_trip.extra_clients, e.route_id, e.client_name)
  on conflict (stop_id, entry_id, task_type) do update set
    quantity = excluded.quantity,
    unit = excluded.unit,
    status = excluded.status,
    metadata = excluded.metadata,
    completed_at = excluded.completed_at,
    updated_at = now();

  update public.trip_stops s
  set status = 'completed',
      completed_at = coalesce(s.completed_at, v_trip.ended_at, now()),
      completed_by_user_id = coalesce(s.completed_by_user_id, v_trip.driver_id),
      completed_by_name = coalesce(s.completed_by_name, v_trip.driver_name),
      updated_at = now()
  where s.trip_id = v_trip.id
    and v_trip.status = 'finished';

  update public.trip_stop_tasks task
  set status = 'completed',
      completed_at = coalesce(task.completed_at, v_trip.ended_at, now()),
      updated_at = now()
  from public.trip_stops s
  where task.stop_id = s.id
    and s.trip_id = v_trip.id
    and v_trip.status = 'finished';

  -- Kluczowa różnica: po każdym dosynchronizowaniu zadań ponownie ustawiamy
  -- cały kurs według routes.sort_order + clients.sort_order.
  perform private.resequence_trip_stops(v_trip.id);
end;
$$;

revoke execute on function private.sync_trip_course(uuid) from public, anon, authenticated;

-- Napraw także już utworzone kursy. Zakończone kursy zachowują historyczny układ.
do $$
declare
  v_trip record;
begin
  for v_trip in
    select id from public.driver_trips where status in ('planned', 'active', 'handover')
  loop
    perform private.resequence_trip_stops(v_trip.id);
  end loop;
end;
$$;

commit;
