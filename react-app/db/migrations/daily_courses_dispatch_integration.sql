-- Daily courses: stops, tasks, segments, immutable journal and settlement state.
-- Additive integration over the existing driver_trips table.

begin;

alter table public.driver_trips
  add column if not exists km_approval_status text not null default 'not_submitted',
  add column if not exists km_approved_at timestamptz,
  add column if not exists km_approved_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists km_approved_by_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'driver_trips_km_approval_status_check'
      and conrelid = 'public.driver_trips'::regclass
  ) then
    alter table public.driver_trips
      add constraint driver_trips_km_approval_status_check
      check (km_approval_status in ('not_submitted', 'pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists driver_trips_date_status_idx
  on public.driver_trips (trip_date, status, started_at);
create index if not exists driver_trips_km_approved_by_idx
  on public.driver_trips (km_approved_by_user_id)
  where km_approved_by_user_id is not null;

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.driver_trips(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  route_id integer references public.routes(id) on delete set null,
  position integer not null check (position > 0),
  stop_kind text not null default 'client' check (stop_kind in ('client', 'extra')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  note text,
  completed_at timestamptz,
  completed_by_user_id uuid references public.users(id) on delete set null,
  completed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, client_name),
  unique (trip_id, position)
);

create table if not exists public.trip_stop_tasks (
  id bigint generated always as identity primary key,
  stop_id uuid not null references public.trip_stops(id) on delete cascade,
  entry_id text references public.entries(id) on delete set null,
  task_type text not null check (task_type in ('pickup_clean', 'deliver_clean', 'pickup_dirty')),
  quantity numeric,
  unit text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stop_id, entry_id, task_type)
);

create table if not exists public.trip_segments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.driver_trips(id) on delete cascade,
  driver_id uuid references public.users(id) on delete set null,
  driver_name text,
  car text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_km numeric,
  end_reason text check (end_reason is null or end_reason in ('course_finished', 'car_changed', 'driver_handoff')),
  created_at timestamptz not null default now()
);

create table if not exists public.trip_events (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.driver_trips(id) on delete cascade,
  stop_id uuid references public.trip_stops(id) on delete set null,
  segment_id uuid references public.trip_segments(id) on delete set null,
  event_type text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_name text,
  actor_role text,
  details text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trip_stops_trip_position_idx
  on public.trip_stops (trip_id, position);
create index if not exists trip_stops_client_id_idx
  on public.trip_stops (client_id)
  where client_id is not null;
create index if not exists trip_stops_route_id_idx
  on public.trip_stops (route_id)
  where route_id is not null;
create index if not exists trip_stop_tasks_stop_status_idx
  on public.trip_stop_tasks (stop_id, status, task_type);
create index if not exists trip_stop_tasks_entry_id_idx
  on public.trip_stop_tasks (entry_id)
  where entry_id is not null;
create index if not exists trip_segments_trip_started_idx
  on public.trip_segments (trip_id, started_at);
create unique index if not exists trip_segments_one_open_idx
  on public.trip_segments (trip_id)
  where ended_at is null;
create index if not exists trip_segments_driver_id_idx
  on public.trip_segments (driver_id)
  where driver_id is not null;
create index if not exists trip_events_trip_created_idx
  on public.trip_events (trip_id, created_at, id);
create index if not exists trip_events_stop_created_idx
  on public.trip_events (stop_id, created_at)
  where stop_id is not null;
create index if not exists trip_events_actor_user_idx
  on public.trip_events (actor_user_id)
  where actor_user_id is not null;

alter table public.trip_stops enable row level security;
alter table public.trip_stop_tasks enable row level security;
alter table public.trip_segments enable row level security;
alter table public.trip_events enable row level security;

revoke all on table public.trip_stops from public, anon, authenticated;
revoke all on table public.trip_stop_tasks from public, anon, authenticated;
revoke all on table public.trip_segments from public, anon, authenticated;
revoke all on table public.trip_events from public, anon, authenticated;
revoke all on sequence public.trip_stop_tasks_id_seq from public, anon, authenticated;
revoke all on sequence public.trip_events_id_seq from public, anon, authenticated;

create or replace function private.trip_includes_client(
  p_routes text,
  p_extra_clients text,
  p_route_id integer,
  p_client_name text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(trim(p_routes), '') = ''
    or p_route_id = any(string_to_array(p_routes, ',')::integer[])
    or (
      p_extra_clients is not null
      and jsonb_typeof(p_extra_clients::jsonb) = 'array'
      and p_extra_clients::jsonb ? p_client_name
    )
$$;

create or replace function private.entry_arrival_date(p_week_key text, p_arr_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_week_key ~ '^\d{4}-\d{2}-\d{2}$'
      then p_week_key::date + (greatest(coalesce(p_arr_day, 1), 1) - 1)
    else null
  end
$$;

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
end;
$$;

revoke execute on function private.trip_includes_client(text, text, integer, text) from public, anon, authenticated;
revoke execute on function private.entry_arrival_date(text, integer) from public, anon, authenticated;
revoke execute on function private.sync_trip_course(uuid) from public, anon, authenticated;

create or replace function public.driver_trip_course_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  perform private.sync_trip_course(new.id);
  return new;
end;
$$;

drop trigger if exists driver_trip_course_sync on public.driver_trips;
create trigger driver_trip_course_sync
after insert or update of routes, extra_clients on public.driver_trips
for each row execute function public.driver_trip_course_sync_trigger();

create or replace function public.driver_trip_segment_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_segment public.trip_segments;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      insert into public.trip_segments (trip_id, driver_id, driver_name, car, started_at)
      values (new.id, new.driver_id, new.driver_name, new.car, coalesce(new.started_at, now()))
      on conflict do nothing;
      insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, details, data, created_at)
      values (new.id, 'course_started', new.driver_id, new.driver_name, 'Kurs rozpoczęty', jsonb_build_object('car', new.car), coalesce(new.started_at, now()));
    else
      insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, details, data)
      values (new.id, 'course_planned', new.driver_id, new.driver_name, 'Kurs zaplanowany', jsonb_build_object('car', new.car, 'routes', new.routes));
    end if;
    return new;
  end if;

  if old.status is distinct from new.status and new.status = 'active' then
    insert into public.trip_segments (trip_id, driver_id, driver_name, car, started_at)
    values (new.id, new.driver_id, new.driver_name, new.car, coalesce(new.started_at, now()))
    on conflict do nothing;
    insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, details, data)
    values (new.id, 'course_started', new.driver_id, new.driver_name, 'Kurs rozpoczęty', jsonb_build_object('car', new.car));
  end if;

  if new.status = 'active' and (old.car is distinct from new.car or old.driver_id is distinct from new.driver_id) then
    v_reason := case when old.driver_id is distinct from new.driver_id then 'driver_handoff' else 'car_changed' end;
    update public.trip_segments
    set ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, v_reason)
    where trip_id = new.id and ended_at is null
    returning * into v_segment;

    insert into public.trip_segments (trip_id, driver_id, driver_name, car, started_at)
    values (new.id, new.driver_id, new.driver_name, new.car, now())
    on conflict do nothing;

    insert into public.trip_events (trip_id, segment_id, event_type, actor_user_id, actor_name, details, data)
    values (
      new.id, v_segment.id, v_reason, new.driver_id, new.driver_name,
      case when v_reason = 'driver_handoff' then 'Przekazano kurs innemu kierowcy' else 'Zmieniono auto w kursie' end,
      jsonb_build_object('from_driver', old.driver_name, 'to_driver', new.driver_name, 'from_car', old.car, 'to_car', new.car)
    );
  end if;

  if old.status is distinct from new.status and new.status = 'finished' then
    update public.trip_segments
    set ended_at = coalesce(new.ended_at, now()), end_km = new.end_km, end_reason = 'course_finished'
    where trip_id = new.id and ended_at is null
    returning * into v_segment;
    insert into public.trip_events (trip_id, segment_id, event_type, actor_user_id, actor_name, details, data, created_at)
    values (
      new.id, v_segment.id, 'course_finished', new.driver_id, new.driver_name,
      'Kurs zakończony', jsonb_build_object('end_km', new.end_km), coalesce(new.ended_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists driver_trip_segment_events on public.driver_trips;
create trigger driver_trip_segment_events
after insert or update of status, car, driver_id on public.driver_trips
for each row execute function public.driver_trip_segment_event_trigger();

create or replace function public.trip_capture_entry_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip public.driver_trips;
  v_stop public.trip_stops;
  v_actor_id uuid;
  v_actor_name text;
  v_event_type text;
begin
  if old.done is not distinct from new.done and old.delivered is not distinct from new.delivered then
    return new;
  end if;

  if old.delivered is distinct from new.delivered then
    v_actor_name := coalesce(new.delivered_by, old.delivered_by);
    v_event_type := case when new.delivered then 'delivery_completed' else 'delivery_reopened' end;
  else
    v_actor_name := coalesce(new.picked_by, old.picked_by);
    v_event_type := case when new.done then 'laundry_pickup_completed' else 'laundry_pickup_reopened' end;
  end if;

  select u.id into v_actor_id from public.users u where u.name = v_actor_name order by u.created_at limit 1;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.driver_name = v_actor_name
    and dt.trip_date = (now() at time zone 'Europe/Warsaw')::date
    and dt.status in ('active', 'finished')
    and private.trip_includes_client(dt.routes, dt.extra_clients, new.route_id, new.client_name)
  order by (dt.status = 'active') desc, dt.started_at desc
  limit 1;

  if v_trip.id is null then return new; end if;
  perform private.sync_trip_course(v_trip.id);
  select * into v_stop from public.trip_stops where trip_id = v_trip.id and client_name = new.client_name;
  if v_stop.id is null then return new; end if;

  update public.trip_stop_tasks
  set status = case
        when task_type = 'pickup_clean' then case when new.done then 'completed' else 'pending' end
        when task_type = 'deliver_clean' then case when new.delivered then 'completed' else 'pending' end
        else status
      end,
      completed_at = case
        when task_type = 'pickup_clean' and new.done then coalesce(
          case when new.picked_at ~ '^\d{4}-\d{2}-\d{2}' then new.picked_at::timestamptz else null end,
          now()
        )
        when task_type = 'deliver_clean' and new.delivered then coalesce(new.delivered_at, now())
        when task_type in ('pickup_clean', 'deliver_clean') then null
        else completed_at
      end,
      updated_at = now()
  where stop_id = v_stop.id and entry_id = new.id;

  insert into public.trip_events (trip_id, stop_id, event_type, actor_user_id, actor_name, details, data)
  values (
    v_trip.id, v_stop.id, v_event_type, v_actor_id, v_actor_name,
    case
      when v_event_type = 'delivery_completed' then 'Dostarczono czyste pranie'
      when v_event_type = 'delivery_reopened' then 'Cofnięto dostawę'
      when v_event_type = 'laundry_pickup_completed' then 'Odebrano czyste pranie z pralni'
      else 'Cofnięto odbiór z pralni'
    end,
    jsonb_build_object('entry_id', new.id, 'client_name', new.client_name, 'weight', new.weight)
  );
  return new;
end;
$$;

drop trigger if exists trip_capture_entry_event on public.entries;
create trigger trip_capture_entry_event
after update of done, delivered on public.entries
for each row execute function public.trip_capture_entry_event_trigger();

create or replace function public.get_dispatch_board(
  p_session_token text,
  p_trip_date date default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_date date := coalesce(p_trip_date, (now() at time zone 'Europe/Warsaw')::date);
  v_trip record;
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  for v_trip in select id from public.driver_trips where trip_date = v_date loop
    perform private.sync_trip_course(v_trip.id);
  end loop;

  select coalesce(json_agg(row_to_json(board) order by board.started_at, board.id), '[]'::json)
  into v_rows
  from (
    select
      dt.*,
      case
        when dt.status = 'planned' and (dt.driver_id is null or nullif(trim(coalesce(dt.car, '')), '') is null) then 'planning'
        when dt.status = 'planned' then 'ready'
        when dt.status in ('active', 'handover') then 'active'
        when dt.status = 'finished'
          and dt.km_approval_status = 'approved'
          and coalesce(wtr.status, 'pending') = 'approved' then 'closed'
        else 'settlement'
      end as board_status,
      coalesce(stop_stats.stops_total, 0) as stops_total,
      coalesce(stop_stats.stops_completed, 0) as stops_completed,
      stop_stats.current_stop_name,
      route_info.route_name,
      route_info.route_display,
      wtr.status as hours_status,
      case when wtr.reported_start is not null
        then to_char(wtr.reported_start, 'HH24:MI') || '–' || to_char(wtr.reported_end, 'HH24:MI')
        else null end as reported_hours,
      problem.details as problem_label,
      problem.created_at as problem_at
    from public.driver_trips dt
    left join public.work_time_reports wtr on wtr.source_trip_id = dt.id
    left join lateral (
      select count(*)::integer as stops_total,
             count(*) filter (where s.status in ('completed', 'skipped'))::integer as stops_completed,
             (array_agg(s.client_name order by (s.status = 'pending') desc, s.position)
                filter (where s.status = 'pending'))[1] as current_stop_name
      from public.trip_stops s where s.trip_id = dt.id
    ) stop_stats on true
    left join lateral (
      select string_agg(r.name, ', ' order by r.sort_order) as route_name,
             min(numbered.display_no) as route_display
      from unnest(string_to_array(nullif(dt.routes, ''), ',')) route_id_text
      join public.routes r on r.id = trim(route_id_text)::integer
      join lateral (
        select (row_number() over (order by rr.sort_order))::integer as display_no, rr.id
        from public.routes rr
      ) numbered on numbered.id = r.id
    ) route_info on true
    left join lateral (
      select ev.details, ev.created_at
      from public.trip_events ev
      where ev.trip_id = dt.id and ev.event_type in ('problem_reported', 'client_unavailable', 'partial_pickup')
      order by ev.created_at desc limit 1
    ) problem on true
    where dt.trip_date = v_date
  ) board;

  return json_build_object('ok', true, 'trip_date', v_date, 'trips', v_rows);
end;
$$;

create or replace function public.get_trip_journal(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_events json;
  v_segments json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') and v_trip.driver_id is distinct from v_user.id then
    raise exception 'Course access denied' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x) order by x.created_at, x.id), '[]'::json)
  into v_events
  from (
    select ev.*, s.client_name
    from public.trip_events ev
    left join public.trip_stops s on s.id = ev.stop_id
    where ev.trip_id = p_trip_id
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.started_at), '[]'::json)
  into v_segments
  from (select * from public.trip_segments where trip_id = p_trip_id) x;

  return json_build_object('ok', true, 'events', v_events, 'segments', v_segments);
end;
$$;

create or replace function public.get_driver_course(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_stops json := '[]'::json;
  v_report json;
  v_employee json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver', 'admin_viewer_driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  select * into v_trip
  from public.driver_trips
  where driver_id = v_user.id
    and (status = 'active' or (status = 'planned' and trip_date = (now() at time zone 'Europe/Warsaw')::date))
  order by (status = 'active') desc, planned_start nulls last, started_at desc
  limit 1;

  if v_trip.id is null then
    return json_build_object('ok', true, 'trip', null, 'stops', '[]'::json);
  end if;

  perform private.sync_trip_course(v_trip.id);

  select coalesce(json_agg(row_to_json(stop_row) order by stop_row.position), '[]'::json)
  into v_stops
  from (
    select
      s.*,
      c.lat, c.lng,
      coalesce(receipt.address, '') as address,
      coalesce(tasks.items, '[]'::json) as tasks
    from public.trip_stops s
    left join public.clients c on c.id = s.client_id
    left join lateral (
      select lr.address from public.laundry_receipts lr
      where lr.client_name = s.client_name and lr.deleted_at is null and nullif(trim(coalesce(lr.address, '')), '') is not null
      order by lr.created_at desc limit 1
    ) receipt on true
    left join lateral (
      select json_agg(row_to_json(task_row) order by task_row.id) as items
      from (
        select task.*, e.done, e.delivered, e.picked_by, e.delivered_by,
               e.laundry_packed_at, e.laundry_ready_at, e.laundry_trolley_no, e.laundry_trolley_cycle_id
        from public.trip_stop_tasks task
        left join public.entries e on e.id = task.entry_id
        where task.stop_id = s.id
      ) task_row
    ) tasks on true
    where s.trip_id = v_trip.id
  ) stop_row;

  select row_to_json(r) into v_report
  from public.work_time_reports r where r.source_trip_id = v_trip.id order by r.reported_at desc limit 1;
  select row_to_json(e) into v_employee
  from (
    select emp.id, emp.name, emp.default_start, emp.default_end
    from public.users u join public.employees emp on emp.id = u.employee_id
    where u.id = v_trip.driver_id
  ) e;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip), 'stops', v_stops, 'work_time_report', v_report, 'employee', v_employee);
end;
$$;

create or replace function public.driver_complete_trip_stop(
  p_session_token text,
  p_stop_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_stop public.trip_stops;
  v_trip public.driver_trips;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  select * into v_stop from public.trip_stops where id = p_stop_id for update;
  select * into v_trip from public.driver_trips where id = v_stop.trip_id;
  if v_stop.id is null or v_trip.id is null then return json_build_object('error', 'Nie znaleziono przystanku'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;
  if v_trip.status <> 'active' then return json_build_object('error', 'Kurs nie jest aktywny'); end if;

  perform private.sync_trip_course(v_trip.id);
  if exists (
    select 1 from public.trip_stop_tasks
    where stop_id = v_stop.id and task_type = 'deliver_clean' and status <> 'completed'
  ) then return json_build_object('error', 'Najpierw wykonaj dostawy na tym przystanku'); end if;

  update public.trip_stop_tasks
  set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
  where stop_id = v_stop.id and status = 'pending';
  update public.trip_stops
  set status = 'completed', completed_at = now(), completed_by_user_id = v_user.id,
      completed_by_name = v_user.name, updated_at = now()
  where id = v_stop.id returning * into v_stop;

  insert into public.trip_events (trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (v_trip.id, v_stop.id, 'stop_completed', v_user.id, v_user.name, v_user.role,
          'Zakończono przystanek: ' || v_stop.client_name, jsonb_build_object('position', v_stop.position));
  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.driver_report_trip_problem(
  p_session_token text,
  p_trip_id uuid,
  p_stop_id uuid,
  p_problem_type text,
  p_details text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_event_type text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;
  if p_problem_type not in ('partial', 'closed', 'extra', 'car', 'handoff', 'note') then
    return json_build_object('error', 'Nieprawidłowy typ problemu');
  end if;
  v_event_type := case
    when p_problem_type = 'partial' then 'partial_pickup'
    when p_problem_type = 'closed' then 'client_unavailable'
    else 'problem_reported'
  end;
  if p_problem_type = 'closed' and p_stop_id is not null then
    update public.trip_stops set status = 'skipped', completed_at = now(), completed_by_user_id = v_user.id,
      completed_by_name = v_user.name, updated_at = now() where id = p_stop_id and trip_id = p_trip_id;
    update public.trip_stop_tasks set status = 'skipped', completed_at = now(), updated_at = now()
      where stop_id = p_stop_id and status = 'pending';
  end if;
  insert into public.trip_events (trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (p_trip_id, p_stop_id, v_event_type, v_user.id, v_user.name, v_user.role,
          coalesce(nullif(trim(coalesce(p_details, '')), ''), p_problem_type), jsonb_build_object('problem_type', p_problem_type));
  return json_build_object('ok', true);
end;
$$;

create or replace function public.driver_change_course_vehicle(
  p_session_token text,
  p_trip_id uuid,
  p_car text,
  p_end_km numeric default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twój kurs'); end if;
  if v_trip.status <> 'active' then return json_build_object('error', 'Kurs nie jest aktywny'); end if;
  if nullif(trim(coalesce(p_car, '')), '') is null or p_car = v_trip.car then return json_build_object('error', 'Wybierz inne auto'); end if;
  if exists (select 1 from public.driver_trips where id <> p_trip_id and status = 'active' and car = p_car) then
    return json_build_object('error', 'To auto jest już używane');
  end if;
  update public.trip_segments set end_km = p_end_km
  where trip_id = p_trip_id and ended_at is null;
  update public.driver_trips set car = trim(p_car) where id = p_trip_id returning * into v_trip;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

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
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if v_trip.status <> 'finished' then return json_build_object('error', 'Kurs nie jest zakończony'); end if;
  if p_end_km is null then return json_build_object('error', 'Brak licznika'); end if;

  update public.driver_trips
  set end_km = p_end_km, km_approval_status = 'approved', km_approved_at = now(),
      km_approved_by_user_id = v_admin.id, km_approved_by_name = v_admin.name
  where id = p_trip_id returning * into v_trip;

  if p_write_costs then
    insert into public.daily_costs (entry_date, fiat_end, isuzu_end, merc_end, iveco_end, updated_at, updated_by)
    values (
      v_trip.trip_date::text,
      case when v_trip.car = 'fiat' then p_end_km::text else null end,
      case when v_trip.car = 'isuzu' then p_end_km::text else null end,
      case when v_trip.car = 'merc' then p_end_km::text else null end,
      case when v_trip.car = 'iveco' then p_end_km::text else null end,
      now(), v_admin.name
    )
    on conflict (entry_date) do update set
      fiat_end = coalesce(excluded.fiat_end, public.daily_costs.fiat_end),
      isuzu_end = coalesce(excluded.isuzu_end, public.daily_costs.isuzu_end),
      merc_end = coalesce(excluded.merc_end, public.daily_costs.merc_end),
      iveco_end = coalesce(excluded.iveco_end, public.daily_costs.iveco_end),
      updated_at = now(), updated_by = excluded.updated_by;
  end if;

  insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, actor_role, details, data)
  values (p_trip_id, 'kilometers_approved', v_admin.id, v_admin.name, v_admin.role,
          'Zatwierdzono licznik kursu', jsonb_build_object('end_km', p_end_km, 'written_to_costs', p_write_costs));
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.admin_set_course_stage(
  p_session_token text,
  p_trip_id uuid,
  p_stage text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_trip public.driver_trips;
  v_hours_status text;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;
  if p_stage not in ('planning', 'ready', 'active', 'settlement', 'closed') then return json_build_object('error', 'Nieprawidłowy etap'); end if;

  if p_stage = 'planning' then
    if v_trip.status <> 'planned' then return json_build_object('error', 'Rozpoczętego kursu nie można cofnąć do planowania'); end if;
  elsif p_stage = 'ready' then
    if v_trip.status <> 'planned' then return json_build_object('error', 'Tylko planowany kurs może być gotowy'); end if;
    if v_trip.driver_id is null or nullif(trim(coalesce(v_trip.car, '')), '') is null then return json_build_object('error', 'Przypisz kierowcę i auto'); end if;
  elsif p_stage = 'active' then
    if v_trip.status <> 'planned' then return json_build_object('error', 'Tylko gotowy kurs można rozpocząć'); end if;
    update public.driver_trips set status = 'active', started_at = now() where id = p_trip_id returning * into v_trip;
  elsif p_stage = 'settlement' then
    if v_trip.status <> 'finished' then return json_build_object('error', 'Kurs musi zakończyć kierowca wraz z licznikiem'); end if;
  else
    select status into v_hours_status from public.work_time_reports where source_trip_id = p_trip_id order by reported_at desc limit 1;
    if v_trip.status <> 'finished' or v_trip.km_approval_status <> 'approved' or v_hours_status <> 'approved' then
      return json_build_object('error', 'Najpierw zatwierdź kilometry i czas pracy');
    end if;
  end if;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

-- Backfill settlement state and course structure for existing records.
update public.driver_trips dt
set km_approval_status = case when dt.end_km is null then 'not_submitted' else 'pending' end
where dt.km_approval_status = 'not_submitted';

update public.driver_trips dt
set km_approval_status = 'approved'
from public.daily_costs dc
where dc.entry_date = dt.trip_date::text
  and dt.end_km is not null
  and case dt.car
    when 'fiat' then case when replace(trim(dc.fiat_end), ',', '.') ~ '^\d+(\.\d+)?$' then replace(trim(dc.fiat_end), ',', '.')::numeric end
    when 'isuzu' then case when replace(trim(dc.isuzu_end), ',', '.') ~ '^\d+(\.\d+)?$' then replace(trim(dc.isuzu_end), ',', '.')::numeric end
    when 'merc' then case when replace(trim(dc.merc_end), ',', '.') ~ '^\d+(\.\d+)?$' then replace(trim(dc.merc_end), ',', '.')::numeric end
    when 'iveco' then case when replace(trim(dc.iveco_end), ',', '.') ~ '^\d+(\.\d+)?$' then replace(trim(dc.iveco_end), ',', '.')::numeric end
    else null
  end = dt.end_km;

do $$
declare v_trip record;
begin
  for v_trip in select * from public.driver_trips order by started_at loop
    perform private.sync_trip_course(v_trip.id);
    if not exists (select 1 from public.trip_segments where trip_id = v_trip.id) then
      insert into public.trip_segments (trip_id, driver_id, driver_name, car, started_at, ended_at, end_km, end_reason)
      values (
        v_trip.id, v_trip.driver_id, v_trip.driver_name, v_trip.car, coalesce(v_trip.started_at, now()),
        v_trip.ended_at, v_trip.end_km, case when v_trip.status = 'finished' then 'course_finished' else null end
      );
    end if;
    if not exists (select 1 from public.trip_events where trip_id = v_trip.id) then
      insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, details, data, created_at)
      values (
        v_trip.id,
        case when v_trip.status = 'planned' then 'course_planned' else 'course_started' end,
        v_trip.driver_id, v_trip.driver_name,
        case when v_trip.status = 'planned' then 'Kurs zaplanowany' else 'Kurs rozpoczęty' end,
        jsonb_build_object('car', v_trip.car, 'routes', v_trip.routes),
        coalesce(v_trip.started_at, now())
      );
      if v_trip.status = 'finished' then
        insert into public.trip_events (trip_id, event_type, actor_user_id, actor_name, details, data, created_at)
        values (v_trip.id, 'course_finished', v_trip.driver_id, v_trip.driver_name, 'Kurs zakończony',
                jsonb_build_object('end_km', v_trip.end_km), coalesce(v_trip.ended_at, now()));
      end if;
    end if;
  end loop;
end $$;

revoke all on function public.driver_trip_course_sync_trigger() from public, anon, authenticated;
revoke all on function public.driver_trip_segment_event_trigger() from public, anon, authenticated;
revoke all on function public.trip_capture_entry_event_trigger() from public, anon, authenticated;

grant execute on function public.get_dispatch_board(text, date) to anon, authenticated;
grant execute on function public.get_trip_journal(text, uuid) to anon, authenticated;
grant execute on function public.get_driver_course(text) to anon, authenticated;
grant execute on function public.driver_complete_trip_stop(text, uuid) to anon, authenticated;
grant execute on function public.driver_report_trip_problem(text, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.driver_change_course_vehicle(text, uuid, text, numeric) to anon, authenticated;
grant execute on function public.admin_approve_course_km(text, uuid, numeric, boolean) to anon, authenticated;
grant execute on function public.admin_set_course_stage(text, uuid, text) to anon, authenticated;

commit;
