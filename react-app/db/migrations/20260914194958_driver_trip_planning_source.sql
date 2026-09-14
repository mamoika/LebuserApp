-- Rozdziela kurs przygotowany samodzielnie przez kierowcę od kursu
-- przygotowanego wcześniej przez dyspozytora. Godzina planowanego startu
-- pozostaje wyłącznie informacyjna i nie służy do rozpoznawania źródła.

begin;

alter table public.driver_trips
  add column if not exists planning_source text,
  add column if not exists planned_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists planned_by_name text;

update public.driver_trips
set planning_source = 'legacy'
where planning_source is null;

-- Starszy kurs rozpoznajemy jako dyspozytorski tylko wtedy, gdy zachował
-- jawny ślad administratora. Pozostałych rekordów nie zgadujemy.
with admin_events as (
  select distinct on (e.trip_id)
    e.trip_id, e.actor_user_id, e.actor_name
  from public.trip_events e
  where e.event_type = 'course_planned'
    and e.actor_role in ('admin', 'admin_viewer', 'admin_viewer_driver')
  order by e.trip_id, e.created_at, e.id
)
update public.driver_trips trip
set planning_source = 'dispatcher',
    planned_by_user_id = coalesce(trip.planned_by_user_id, event.actor_user_id),
    planned_by_name = coalesce(trip.planned_by_name, event.actor_name)
from admin_events event
where event.trip_id = trip.id
  and trip.planning_source = 'legacy';

alter table public.driver_trips
  alter column planning_source set default 'driver',
  alter column planning_source set not null;

alter table public.driver_trips
  drop constraint if exists driver_trips_planning_source_check;
alter table public.driver_trips
  add constraint driver_trips_planning_source_check
  check (planning_source in ('driver', 'dispatcher', 'legacy'));

create index if not exists driver_trips_planning_source_idx
  on public.driver_trips (trip_date, planning_source)
  where status = 'planned';

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

  -- Puste punkty harmonogramu należą wyłącznie do planu dyspozytora.
  -- Usuwa to również błędnie wygenerowane punkty ze starszych kursów kierowcy.
  delete from public.trip_stops stop
  where stop.trip_id = v_trip.id
    and stop.stop_kind = 'scheduled'
    and stop.status = 'pending'
    and not exists (select 1 from public.trip_stop_tasks task where task.stop_id = stop.id)
    and (
      v_trip.planning_source is distinct from 'dispatcher'
      or stop.client_id is null
      or not private.client_service_is_due(stop.client_id, v_trip.trip_date)
      or not private.trip_includes_client(
        v_trip.routes, v_trip.extra_clients, stop.route_id, stop.client_name
      )
    );

  select coalesce(max(position), 0) into v_max_position
  from public.trip_stops where trip_id = p_trip_id;

  insert into public.trip_stops (
    trip_id, client_id, client_name, route_id, position, stop_kind, note
  )
  select
    v_trip.id,
    client.id,
    work.client_name,
    coalesce(client.route_id, work.route_id),
    v_max_position + row_number() over (
      order by coalesce(route.sort_order, 9999), coalesce(client.sort_order, 9999), work.client_name
    ),
    case
      when v_trip.extra_clients is not null
       and jsonb_typeof(v_trip.extra_clients::jsonb) = 'array'
       and v_trip.extra_clients::jsonb ? work.client_name then 'extra'
      when work.scheduled_only then 'scheduled'
      else 'client'
    end,
    client.note
  from (
    select source.client_name, min(source.route_id) as route_id,
           bool_and(source.is_scheduled) as scheduled_only
    from (
      -- Rzeczywiste zadania/pranie są widoczne w obu rodzajach kursu.
      select entry.client_name, entry.route_id, false as is_scheduled
      from public.entries entry
      where entry.deleted_at is null
        and private.trip_includes_client(
          v_trip.routes, v_trip.extra_clients, entry.route_id, entry.client_name
        )
        and (
          public.lebuser_pickup_date(entry.week_key, entry.pick_week_key, entry.pick_day) = v_trip.trip_date
          or (
            public.lebuser_pickup_date(entry.week_key, entry.pick_week_key, entry.pick_day) < v_trip.trip_date
            and coalesce(entry.delivered, false) = false
          )
          or private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date
          or (
            entry.picked_by = v_trip.driver_name
            and entry.picked_at ~ '^\d{4}-\d{2}-\d{2}'
            and (entry.picked_at::timestamptz at time zone 'Europe/Warsaw')::date = v_trip.trip_date
          )
          or (
            entry.delivered_by = v_trip.driver_name
            and (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
          )
        )
      union all
      -- Cykliczny harmonogram klientów tworzy puste punkty tylko wtedy,
      -- gdy sam kurs został wcześniej przygotowany przez dyspozytora.
      select scheduled.name, scheduled.route_id, true
      from public.clients scheduled
      where v_trip.planning_source = 'dispatcher'
        and private.client_service_is_due(scheduled.id, v_trip.trip_date)
        and private.trip_includes_client(
          v_trip.routes, v_trip.extra_clients, scheduled.route_id, scheduled.name
        )
    ) source
    group by source.client_name
  ) work
  left join public.clients client on client.name = work.client_name
  left join public.routes route on route.id = coalesce(client.route_id, work.route_id)
  where not exists (
    select 1 from public.trip_stops existing
    where existing.trip_id = v_trip.id and existing.client_name = work.client_name
  );

  update public.trip_stops stop
  set client_id = coalesce(stop.client_id, client.id),
      route_id = coalesce(client.route_id, stop.route_id),
      note = client.note,
      updated_at = now()
  from public.clients client
  where stop.trip_id = v_trip.id and client.name = stop.client_name;

  insert into public.trip_stop_tasks (
    stop_id, entry_id, task_type, quantity, unit, status, metadata, completed_at
  )
  select stop.id, entry.id, task.task_type,
         case when task.task_type = 'pickup_dirty'
           then coalesce(entry.weight, entry.trolleys::numeric)
           else entry.weight
         end,
         case when entry.weight is not null then 'kg' else 'wózki' end,
         case
           when task.task_type = 'pickup_clean' and entry.done then 'completed'
           when task.task_type = 'deliver_clean' and entry.delivered then 'completed'
           else 'pending'
         end,
         jsonb_build_object(
           'entry_type', coalesce(entry.type, 'P'),
           'trolleys', coalesce(entry.trolleys, 1),
           'picked_baskets', entry.picked_baskets,
           'trolley_cycle_id', entry.laundry_trolley_cycle_id,
           'trolley_no', entry.laundry_trolley_no,
           'laundry_status', entry.laundry_status,
           'urgent', coalesce(entry.urgent, false)
         ),
         case
           when task.task_type = 'pickup_clean' and entry.done then coalesce(
             case when entry.picked_at ~ '^\d{4}-\d{2}-\d{2}'
               then entry.picked_at::timestamptz else null end,
             now()
           )
           when task.task_type = 'deliver_clean' and entry.delivered
             then coalesce(entry.delivered_at, now())
           else null
         end
  from public.trip_stops stop
  join public.entries entry
    on entry.client_name = stop.client_name and entry.deleted_at is null
  cross join lateral (
    select 'pickup_clean'::text as task_type
    where public.lebuser_pickup_date(
      entry.week_key, entry.pick_week_key, entry.pick_day
    ) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(
          entry.week_key, entry.pick_week_key, entry.pick_day
        ) = v_trip.trip_date
        or coalesce(entry.delivered, false) = false
        or (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'deliver_clean'::text
    where public.lebuser_pickup_date(
      entry.week_key, entry.pick_week_key, entry.pick_day
    ) <= v_trip.trip_date
      and (
        public.lebuser_pickup_date(
          entry.week_key, entry.pick_week_key, entry.pick_day
        ) = v_trip.trip_date
        or coalesce(entry.delivered, false) = false
        or (entry.delivered_at at time zone 'Europe/Warsaw')::date = v_trip.trip_date
      )
    union all
    select 'pickup_dirty'::text
    where private.entry_arrival_date(entry.week_key, entry.arr_day) = v_trip.trip_date
  ) task
  where stop.trip_id = v_trip.id
    and private.trip_includes_client(
      v_trip.routes, v_trip.extra_clients, entry.route_id, entry.client_name
    )
  on conflict (stop_id, entry_id, task_type) do update set
    quantity = excluded.quantity,
    unit = excluded.unit,
    status = excluded.status,
    metadata = excluded.metadata,
    completed_at = excluded.completed_at,
    updated_at = now();

  update public.trip_stops stop
  set status = 'completed',
      completed_at = coalesce(stop.completed_at, v_trip.ended_at, now()),
      completed_by_user_id = coalesce(stop.completed_by_user_id, v_trip.driver_id),
      completed_by_name = coalesce(stop.completed_by_name, v_trip.driver_name),
      updated_at = now()
  where stop.trip_id = v_trip.id and v_trip.status = 'finished';

  update public.trip_stop_tasks task
  set status = 'completed',
      completed_at = coalesce(task.completed_at, v_trip.ended_at, now()),
      updated_at = now()
  from public.trip_stops stop
  where task.stop_id = stop.id
    and stop.trip_id = v_trip.id
    and v_trip.status = 'finished';

  perform private.resequence_trip_stops(v_trip.id);
end;
$$;

revoke execute on function private.sync_trip_course(uuid) from public, anon, authenticated;

create or replace function public.driver_start_trip(
  p_session_token text,
  p_planned_trip_id uuid default null,
  p_trip_date date default null,
  p_car text default null,
  p_routes text default ''
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_car text := trim(coalesce(p_car, ''));
  v_trip_date date := coalesce(p_trip_date, public.lebuser_operational_date());
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;
  if v_car <> '' and exists (
    select 1 from public.driver_trips
    where status = 'active' and car = v_car and driver_id is distinct from v_user.id
  ) then return json_build_object('error', 'To auto jest już na trasie u innego kierowcy'); end if;

  if p_planned_trip_id is not null then
    select * into v_trip from public.driver_trips where id = p_planned_trip_id;
    if v_trip.id is null then return json_build_object('error', 'Nie znaleziono zaplanowanej trasy'); end if;
    if v_trip.status <> 'planned' then return json_build_object('error', 'Ta trasa nie jest zaplanowana'); end if;
    if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twoja trasa'); end if;
    update public.driver_trips
    set car = coalesce(nullif(v_car, ''), car),
        routes = coalesce(nullif(p_routes, ''), routes),
        status = 'active', started_at = now(),
        driver_id = coalesce(driver_id, v_user.id), driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
    if exists (
      select 1 from public.driver_trips
      where driver_id = v_user.id and trip_date = v_trip_date and status = 'active'
    ) then return json_build_object('error', 'Masz już aktywną trasę'); end if;
    select * into v_trip from public.driver_trips
    where driver_id = v_user.id and status = 'planned'
    order by (trip_date = v_trip_date) desc, trip_date desc, id desc limit 1;
    if v_trip.id is not null then return json_build_object('ok', true, 'trip', row_to_json(v_trip)); end if;
    insert into public.driver_trips (
      driver_id, driver_name, trip_date, car, routes, status, started_at,
      planning_source, planned_by_user_id, planned_by_name
    ) values (
      v_user.id, v_user.name, v_trip_date, v_car, coalesce(p_routes, ''), 'planned', null,
      'driver', v_user.id, v_user.name
    )
    returning * into v_trip;
  end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.admin_plan_driver_trip(
  p_session_token text,
  p_driver_id uuid,
  p_trip_date date,
  p_car text default null,
  p_routes text default '',
  p_extra_clients text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_driver_id uuid;
  v_driver_name text;
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;

  if p_trip_date is null then
    return json_build_object('error', 'Brak daty trasy');
  end if;

  if p_driver_id is not null then
    select id, name into v_driver_id, v_driver_name
    from public.users
    where id = p_driver_id
      and role in ('admin', 'driver');

    if v_driver_id is null then
      return json_build_object('error', 'Nie znaleziono kierowcy');
    end if;
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients,
    planned_start, started_at, planning_source, planned_by_user_id, planned_by_name
  ) values (
    v_driver_id, v_driver_name, p_trip_date,
    trim(coalesce(p_car, '')), coalesce(p_routes, ''), 'planned', p_extra_clients,
    p_planned_start, null, 'dispatcher', v_admin.id, v_admin.name
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text, timestamptz) to anon, authenticated;

commit;
