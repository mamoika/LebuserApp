-- Konstruktor planu obsługi klienta:
-- domyślny plan trasy, indywidualne nadpisanie klienta i cykle wielotygodniowe.

begin;

alter table public.clients
  add column if not exists service_schedule_mode text not null default 'inherit';

alter table public.clients
  drop constraint if exists clients_service_schedule_mode_check;
alter table public.clients
  add constraint clients_service_schedule_mode_check
  check (service_schedule_mode in ('inherit', 'custom', 'disabled'));

create table if not exists public.route_service_rules (
  id uuid primary key default gen_random_uuid(),
  route_id integer not null references public.routes(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  interval_weeks smallint not null default 1 check (interval_weeks between 1 and 4),
  anchor_week date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, weekday),
  check (extract(isodow from anchor_week) = 1)
);

create table if not exists public.client_service_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  interval_weeks smallint not null default 1 check (interval_weeks between 1 and 4),
  anchor_week date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, weekday),
  check (extract(isodow from anchor_week) = 1)
);

create index if not exists route_service_rules_route_idx
  on public.route_service_rules (route_id, weekday);
create index if not exists client_service_rules_client_idx
  on public.client_service_rules (client_id, weekday);

alter table public.route_service_rules enable row level security;
alter table public.client_service_rules enable row level security;
revoke all on table public.route_service_rules from public, anon, authenticated;
revoke all on table public.client_service_rules from public, anon, authenticated;

drop trigger if exists audit_route_service_rules on public.route_service_rules;
create trigger audit_route_service_rules
after insert or update or delete on public.route_service_rules
for each row execute function private.audit_table_change('routes', 'route_service_rule', 'id', 'weekday');

drop trigger if exists audit_client_service_rules on public.client_service_rules;
create trigger audit_client_service_rules
after insert or update or delete on public.client_service_rules
for each row execute function private.audit_table_change('routes', 'client_service_rule', 'id', 'weekday');

-- Zachowanie dotychczasowych tras: przepisujemy stare presety na jawne reguły.
insert into public.route_service_rules (route_id, weekday, interval_weeks, anchor_week)
select route.id, day.weekday, 1, date '2026-01-05'
from public.routes route
cross join lateral (
  select unnest(
    case route.schedule
      when 'daily' then array[1, 2, 3, 4, 5]
      when 'mwf' then array[1, 3, 5]
      when 'tth' then array[2, 4]
      else array[]::integer[]
    end
  )::smallint as weekday
) day
on conflict (route_id, weekday) do nothing;

create or replace function private.service_rule_is_due(
  p_weekday smallint,
  p_interval_weeks smallint,
  p_anchor_week date,
  p_service_date date
)
returns boolean
language sql
stable
set search_path = public, private
as $$
  select p_service_date >= p_anchor_week
    and extract(isodow from p_service_date)::integer = p_weekday
    and (
      ((p_service_date - p_anchor_week) / 7) % greatest(p_interval_weeks, 1)
    ) = 0;
$$;

create or replace function private.client_service_is_due(
  p_client_id uuid,
  p_service_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_client public.clients;
  v_route public.routes;
begin
  select * into v_client from public.clients where id = p_client_id;
  if v_client.id is null or v_client.service_schedule_mode = 'disabled' then
    return false;
  end if;

  if v_client.service_schedule_mode = 'custom' then
    return exists (
      select 1
      from public.client_service_rules rule
      where rule.client_id = v_client.id
        and private.service_rule_is_due(
          rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
        )
    );
  end if;

  if exists (select 1 from public.route_service_rules where route_id = v_client.route_id) then
    return exists (
      select 1
      from public.route_service_rules rule
      where rule.route_id = v_client.route_id
        and private.service_rule_is_due(
          rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
        )
    );
  end if;

  select * into v_route from public.routes where id = v_client.route_id;
  return case coalesce(v_route.schedule, 'other')
    when 'daily' then extract(isodow from p_service_date)::integer between 1 and 5
    when 'mwf' then extract(isodow from p_service_date)::integer in (1, 3, 5)
    when 'tth' then extract(isodow from p_service_date)::integer in (2, 4)
    else false
  end;
end;
$$;

revoke execute on function private.service_rule_is_due(smallint, smallint, date, date) from public, anon, authenticated;
revoke execute on function private.client_service_is_due(uuid, date) from public, anon, authenticated;

create or replace function private.insert_service_rules(
  p_owner_kind text,
  p_owner_id text,
  p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rule jsonb;
  v_weekday integer;
  v_interval integer;
  v_anchor date;
begin
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then
    raise exception 'Reguły planu muszą być listą' using errcode = '22023';
  end if;

  for v_rule in select value from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    v_weekday := nullif(v_rule->>'weekday', '')::integer;
    v_interval := coalesce(nullif(v_rule->>'interval_weeks', '')::integer, 1);
    v_anchor := date_trunc(
      'week',
      coalesce(nullif(v_rule->>'anchor_week', '')::date, current_date)
    )::date;

    if v_weekday not between 1 and 5 or v_interval not between 1 and 4 then
      raise exception 'Nieprawidłowa reguła planu obsługi' using errcode = '22023';
    end if;

    if p_owner_kind = 'route' then
      insert into public.route_service_rules (route_id, weekday, interval_weeks, anchor_week)
      values (p_owner_id::integer, v_weekday, v_interval, v_anchor);
    elsif p_owner_kind = 'client' then
      insert into public.client_service_rules (client_id, weekday, interval_weeks, anchor_week)
      values (p_owner_id::uuid, v_weekday, v_interval, v_anchor);
    else
      raise exception 'Nieprawidłowy właściciel planu obsługi' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke execute on function private.insert_service_rules(text, text, jsonb) from public, anon, authenticated;

create or replace function private.route_schedule_code(p_route_id integer)
returns text
language sql
stable
set search_path = public, private
as $$
  with plan as (
    select
      string_agg(weekday::text, ',' order by weekday) as days,
      bool_and(interval_weeks = 1) as weekly
    from public.route_service_rules
    where route_id = p_route_id
  )
  select case
    when weekly and days = '1,2,3,4,5' then 'daily'
    when weekly and days = '1,3,5' then 'mwf'
    when weekly and days = '2,4' then 'tth'
    else 'other'
  end
  from plan;
$$;

revoke execute on function private.route_schedule_code(integer) from public, anon, authenticated;

create or replace function public.admin_save_route_service_rules(
  p_session_token text,
  p_route_id integer,
  p_rules jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip record;
begin
  perform public.require_admin(p_session_token);
  if not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  delete from public.route_service_rules where route_id = p_route_id;
  perform private.insert_service_rules('route', p_route_id::text, p_rules);
  update public.routes
  set schedule = private.route_schedule_code(p_route_id)
  where id = p_route_id;

  for v_trip in
    select id from public.driver_trips
    where status in ('planned', 'active', 'handover')
      and trip_date >= (now() at time zone 'Europe/Warsaw')::date
  loop
    perform private.sync_trip_course(v_trip.id);
  end loop;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_client_service_rules(
  p_session_token text,
  p_client_id uuid,
  p_mode text,
  p_rules jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_mode text := lower(trim(coalesce(p_mode, 'inherit')));
  v_trip record;
begin
  perform public.require_admin(p_session_token);
  if v_mode not in ('inherit', 'custom', 'disabled') then
    return json_build_object('error', 'Nieprawidłowy tryb planu klienta');
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  if v_mode = 'custom'
     and jsonb_array_length(coalesce(p_rules, '[]'::jsonb)) = 0 then
    return json_build_object('error', 'Własny plan klienta wymaga co najmniej jednego dnia');
  end if;

  update public.clients
  set service_schedule_mode = v_mode
  where id = p_client_id;

  delete from public.client_service_rules where client_id = p_client_id;
  if v_mode = 'custom' then
    perform private.insert_service_rules('client', p_client_id::text, p_rules);
  end if;

  for v_trip in
    select id from public.driver_trips
    where status in ('planned', 'active', 'handover')
      and trip_date >= (now() at time zone 'Europe/Warsaw')::date
  loop
    perform private.sync_trip_course(v_trip.id);
  end loop;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_save_route_service_rules(text, integer, jsonb) to anon, authenticated;
grant execute on function public.admin_save_client_service_rules(text, uuid, text, jsonb) to anon, authenticated;

-- Dodawanie klienta zwraca identyfikator potrzebny do zapisania jego planu.
create or replace function public.admin_insert_client(
  p_session_token text,
  p_name text,
  p_route_id integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_admin(p_session_token);
  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Brak nazwy klienta');
  end if;
  if not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  insert into public.clients (name, route_id, sort_order)
  values (trim(p_name), p_route_id, 9999)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.admin_insert_client(text, text, integer) to anon, authenticated;

alter table public.trip_stops drop constraint if exists trip_stops_stop_kind_check;
alter table public.trip_stops
  add constraint trip_stops_stop_kind_check
  check (stop_kind in ('client', 'extra', 'dirty_only', 'scheduled'));

-- Synchronizacja kursu rozszerzona o puste punkty wynikające z planu obsługi.
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

  -- Usuwamy wyłącznie pusty, niewykonany punkt planowy, który przestał pasować.
  delete from public.trip_stops stop
  where stop.trip_id = v_trip.id
    and stop.stop_kind = 'scheduled'
    and stop.status = 'pending'
    and not exists (select 1 from public.trip_stop_tasks task where task.stop_id = stop.id)
    and (
      stop.client_id is null
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
      select scheduled.name, scheduled.route_id, true
      from public.clients scheduled
      where private.client_service_is_due(scheduled.id, v_trip.trip_date)
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

-- Główne dane aplikacji zawierają reguły osadzone w rekordach tras i klientów.
create or replace function public.get_app_data(
  p_session_token text,
  p_last_week_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_last_week_key text := coalesce(
    nullif(trim(coalesce(p_last_week_key, '')), ''),
    to_char((date_trunc('week', now())::date - 7), 'YYYY-MM-DD')
  );
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select coalesce(json_agg(row_to_json(client_row)), '[]'::json)
  into v_clients
  from (
    select client.*,
      coalesce((
        select json_agg(
          json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          )
          order by rule.weekday
        )
        from public.client_service_rules rule
        where rule.client_id = client.id
      ), '[]'::json) as service_rules
    from public.clients client
    order by client.sort_order
  ) client_row;

  select coalesce(json_agg(row_to_json(route_row)), '[]'::json)
  into v_routes
  from (
    select route.*,
      coalesce((
        select json_agg(
          json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          )
          order by rule.weekday
        )
        from public.route_service_rules rule
        where rule.route_id = route.id
      ), '[]'::json) as service_rules
    from public.routes route
    order by route.sort_order
  ) route_row;

  select coalesce(json_agg(row_to_json(entry_row)), '[]'::json)
  into v_entries
  from (
    select *
    from public.entries
    where deleted_at is null
      and (
        done = false
        or week_key >= v_last_week_key
        or pick_week_key >= v_last_week_key
      )
  ) entry_row;

  if to_regclass('public.laundry_receipts') is not null then
    execute
      'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
       from (
         select *
         from public.laundry_receipts
         where deleted_at is null
         order by doc_no desc
       ) x'
    into v_receipts;
  end if;

  return json_build_object(
    'ok', true,
    'clients', v_clients,
    'routes', v_routes,
    'entries', v_entries,
    'receipts', v_receipts
  );
end;
$$;

grant execute on function public.get_app_data(text, text) to anon, authenticated;

-- Dosynchronizuj otwarte kursy po uruchomieniu migracji.
do $$
declare
  v_trip record;
begin
  for v_trip in
    select id from public.driver_trips
    where status in ('planned', 'active', 'handover')
      and trip_date >= (now() at time zone 'Europe/Warsaw')::date
  loop
    perform private.sync_trip_course(v_trip.id);
  end loop;
end;
$$;

commit;
