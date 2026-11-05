begin;

-- Kartoteka fizycznej floty. Numery w starych tabelach pozostają krótkie
-- ("1", "2"), a interfejs prezentuje je jako LEB-#01, LEB-#02 itd.
create table if not exists public.laundry_trolleys (
  trolley_no text primary key,
  tare_kg numeric(8,2) not null default 35 check (tare_kg > 0),
  active boolean not null default true,
  commissioned_at date,
  retired_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.laundry_trolleys (trolley_no, tare_kg)
select series::text, 35
from generate_series(1, 99) as series
on conflict (trolley_no) do nothing;

alter table public.entries
  add column if not exists arrival_gross_kg numeric(10,2),
  add column if not exists arrival_tare_kg numeric(10,2),
  add column if not exists dirty_received_at timestamptz,
  add column if not exists dirty_received_by text;

alter table public.laundry_trolley_cycles
  add column if not exists load_kind text not null default 'laundry';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'laundry_trolley_cycles_load_kind_check'
  ) then
    alter table public.laundry_trolley_cycles
      add constraint laundry_trolley_cycles_load_kind_check
      check (load_kind in ('laundry', 'empty_transfer'));
  end if;
end $$;

-- Dziennik domenowy jest append-only. Nie zastępuje ogólnego audytu aplikacji:
-- opisuje historię jednego fizycznego numeru w sposób czytelny operacyjnie.
create table if not exists public.laundry_trolley_events (
  id uuid primary key default gen_random_uuid(),
  trolley_no text not null,
  event_type text not null,
  from_status text,
  to_status text not null,
  location_type text not null,
  client_name text,
  entry_id text,
  cycle_id uuid,
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laundry_trolley_events_trolley_time_idx
  on public.laundry_trolley_events (lower(trolley_no), occurred_at desc);
create index if not exists laundry_trolley_events_client_time_idx
  on public.laundry_trolley_events (client_name, occurred_at desc)
  where client_name is not null;
create index if not exists laundry_trolley_events_entry_idx
  on public.laundry_trolley_events (entry_id) where entry_id is not null;
create index if not exists laundry_trolley_events_cycle_idx
  on public.laundry_trolley_events (cycle_id) where cycle_id is not null;

alter table public.laundry_trolleys enable row level security;
alter table public.laundry_trolley_events enable row level security;
revoke all on public.laundry_trolleys, public.laundry_trolley_events from anon, authenticated;

create or replace function private.arrival_tare_kg(
  p_trolley_nos text,
  p_trolley_count integer
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(trim(coalesce(p_trolley_nos, '')), '') is not null then coalesce((
      select sum(coalesce(trolley.tare_kg, 35))
      from (
        select distinct trim(value) as trolley_no
        from unnest(string_to_array(p_trolley_nos, ',')) as value
        where nullif(trim(value), '') is not null
      ) number
      left join public.laundry_trolleys trolley
        on lower(trolley.trolley_no) = lower(number.trolley_no)
    ), 0)
    else greatest(coalesce(p_trolley_count, 0), 0) * 35
  end
$$;

revoke all on function private.arrival_tare_kg(text, integer)
from public, anon, authenticated;

create or replace function private.record_trolley_event(
  p_trolley_no text,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_location_type text,
  p_client_name text default null,
  p_entry_id text default null,
  p_cycle_id uuid default null,
  p_actor_name text default null,
  p_occurred_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(p_trolley_no, '')), '') is null
     or lower(trim(p_trolley_no)) in ('brak', 'bez wózka') then
    return;
  end if;

  insert into public.laundry_trolley_events (
    trolley_no, event_type, from_status, to_status, location_type,
    client_name, entry_id, cycle_id, actor_name, occurred_at, metadata
  ) values (
    trim(p_trolley_no), p_event_type, p_from_status, p_to_status, p_location_type,
    nullif(trim(coalesce(p_client_name, '')), ''), p_entry_id, p_cycle_id,
    nullif(trim(coalesce(p_actor_name, '')), ''), coalesce(p_occurred_at, now()),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.record_trolley_event(
  text, text, text, text, text, text, text, uuid, text, timestamptz, jsonb
) from public, anon, authenticated;

create or replace function private.log_entry_trolley_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no text;
  v_old_nos text[] := array[]::text[];
  v_new_nos text[] := array[]::text[];
  v_actor text;
begin
  if tg_op <> 'INSERT' then
    select coalesce(array_agg(distinct trim(value)), array[]::text[])
    into v_old_nos
    from unnest(string_to_array(coalesce(old.arrival_trolley_nos, ''), ',')) value
    where nullif(trim(value), '') is not null;
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(array_agg(distinct trim(value)), array[]::text[])
    into v_new_nos
    from unnest(string_to_array(coalesce(new.arrival_trolley_nos, ''), ',')) value
    where nullif(trim(value), '') is not null;
  end if;

  v_actor := case when tg_op = 'DELETE' then old.added_by
    else coalesce(new.washed_by, new.added_by) end;

  if tg_op = 'INSERT' then
    foreach v_no in array v_new_nos loop
      perform private.record_trolley_event(
        v_no, 'dirty_picked_up', 'at_client', 'returning_to_laundry', 'vehicle',
        new.client_name, new.id, null, new.added_by, coalesce(new.added_at, now()),
        jsonb_strip_nulls(jsonb_build_object(
          'gross_kg', new.arrival_gross_kg,
          'tare_kg', new.arrival_tare_kg,
          'net_kg', new.weight
        ))
      );
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    foreach v_no in array v_old_nos loop
      if not (v_no = any(v_new_nos)) then
        perform private.record_trolley_event(
          v_no, 'arrival_assignment_removed', 'returning_to_laundry', 'free_at_laundry',
          'laundry', old.client_name, old.id, null, v_actor, now(),
          jsonb_build_object('correction', true)
        );
      end if;
    end loop;
    foreach v_no in array v_new_nos loop
      if not (v_no = any(v_old_nos)) then
        perform private.record_trolley_event(
          v_no, 'dirty_picked_up', 'at_client', 'returning_to_laundry', 'vehicle',
          new.client_name, new.id, null, new.added_by, now(),
          jsonb_build_object('correction', true)
        );
      end if;
    end loop;

    if not coalesce(old.washed, false) and coalesce(new.washed, false) then
      foreach v_no in array v_new_nos loop
        perform private.record_trolley_event(
          v_no, 'released_after_wash', 'dirty_at_laundry', 'free_at_laundry',
          'laundry', new.client_name, new.id, null, new.washed_by,
          coalesce(new.washed_at, now()), '{}'::jsonb
        );
      end loop;
    elsif coalesce(old.washed, false) and not coalesce(new.washed, false) then
      foreach v_no in array v_new_nos loop
        perform private.record_trolley_event(
          v_no, 'wash_reopened', 'free_at_laundry', 'dirty_at_laundry',
          'laundry', new.client_name, new.id, null, v_actor, now(),
          jsonb_build_object('correction', true)
        );
      end loop;
    end if;
    return new;
  end if;

  foreach v_no in array v_old_nos loop
    perform private.record_trolley_event(
      v_no, 'arrival_deleted', null, 'history_corrected', 'laundry',
      old.client_name, old.id, null, v_actor, now(),
      jsonb_build_object('deleted', true)
    );
  end loop;
  return old;
end;
$$;

drop trigger if exists trolley_history_from_entries on public.entries;
create trigger trolley_history_from_entries
after insert or update of arrival_trolley_nos, washed, deleted_at or delete
on public.entries
for each row execute function private.log_entry_trolley_events();

create or replace function private.log_cycle_trolley_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_to_status text;
  v_location text;
  v_actor text;
begin
  if tg_op = 'INSERT' then
    perform private.record_trolley_event(
      new.trolley_no,
      case when new.load_kind = 'empty_transfer' then 'empty_transfer_delivered' else 'packed' end,
      'free_at_laundry',
      case when new.status = 'at_client' then 'at_client' else 'packed_at_laundry' end,
      case when new.status = 'at_client' then 'client' else 'laundry' end,
      new.client_name, null, new.id,
      coalesce(new.delivered_by, new.packed_by), new.packed_at,
      jsonb_build_object('load_kind', new.load_kind, 'total_kg', new.total_kg)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.record_trolley_event(
      old.trolley_no, 'cycle_deleted', old.status, 'history_corrected', 'laundry',
      old.client_name, null, old.id, coalesce(old.returned_by, old.packed_by), now(),
      jsonb_build_object('deleted', true, 'load_kind', old.load_kind)
    );
    return old;
  end if;

  if new.status is not distinct from old.status
     and new.released_at is not distinct from old.released_at
     and new.returned_at is not distinct from old.returned_at then
    return new;
  end if;

  if old.returned_at is null and new.returned_at is not null then
    v_event_type := case when new.status = 'canceled' then 'cycle_canceled' else 'returned_to_laundry' end;
    v_to_status := case when new.status = 'canceled' then 'canceled' else 'free_at_laundry' end;
    v_location := 'laundry';
    v_actor := new.returned_by;
  elsif new.status = 'at_client' and old.status is distinct from 'at_client' then
    v_event_type := case when new.load_kind = 'empty_transfer' then 'empty_transfer_delivered' else 'delivered_to_client' end;
    v_to_status := 'at_client';
    v_location := 'client';
    v_actor := new.delivered_by;
  elsif old.released_at is null and new.released_at is not null then
    v_event_type := 'loaded_for_delivery';
    v_to_status := 'in_transit_to_client';
    v_location := 'vehicle';
    v_actor := new.released_by;
  elsif old.returned_at is not null and new.returned_at is null then
    v_event_type := 'return_reopened';
    v_to_status := new.status;
    v_location := case when new.status = 'at_client' then 'client' else 'laundry' end;
    v_actor := new.packed_by;
  else
    v_event_type := 'status_changed';
    v_to_status := new.status;
    v_location := case when new.status = 'at_client' then 'client' else 'laundry' end;
    v_actor := coalesce(new.delivered_by, new.returned_by, new.released_by, new.packed_by);
  end if;

  perform private.record_trolley_event(
    new.trolley_no, v_event_type, old.status, v_to_status, v_location,
    new.client_name, null, new.id, v_actor, now(),
    jsonb_build_object('load_kind', new.load_kind, 'total_kg', new.total_kg)
  );
  return new;
end;
$$;

drop trigger if exists trolley_history_from_cycles on public.laundry_trolley_cycles;
create trigger trolley_history_from_cycles
after insert or update or delete on public.laundry_trolley_cycles
for each row execute function private.log_cycle_trolley_events();

-- Zakończenie kursu jest momentem przyjęcia brudnych wózków na pralnię.
-- Powiązanie idzie przez zadania kursu, więc nie opiera się na nazwie kierowcy.
create or replace function private.receive_dirty_trolleys_on_trip_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_no text;
begin
  if old.status is not distinct from new.status or new.status <> 'finished' then
    return new;
  end if;

  for v_entry in
    select distinct entry.id, entry.client_name, entry.arrival_trolley_nos
    from public.trip_stops stop
    join public.trip_stop_tasks task on task.stop_id = stop.id
    join public.entries entry on entry.id = task.entry_id
    where stop.trip_id = new.id
      and entry.deleted_at is null
      and entry.dirty_received_at is null
      and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
  loop
    update public.entries
    set dirty_received_at = coalesce(new.ended_at, now()),
        dirty_received_by = new.driver_name
    where id = v_entry.id;

    for v_no in
      select distinct trim(value)
      from unnest(string_to_array(v_entry.arrival_trolley_nos, ',')) value
      where nullif(trim(value), '') is not null
    loop
      perform private.record_trolley_event(
        v_no, 'dirty_received_at_laundry', 'returning_to_laundry', 'dirty_at_laundry',
        'laundry', v_entry.client_name, v_entry.id, null, new.driver_name,
        coalesce(new.ended_at, now()), jsonb_build_object('trip_id', new.id)
      );
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists receive_dirty_trolleys_on_trip_finish on public.driver_trips;
create trigger receive_dirty_trolleys_on_trip_finish
after update of status on public.driver_trips
for each row execute function private.receive_dirty_trolleys_on_trip_finish();

-- Pierwszy snapshot istniejącej floty. ON CONFLICT nie jest potrzebny, ponieważ
-- migracja jest wykonywana raz, a NOT EXISTS chroni powtórne uruchomienie ręczne.
insert into public.laundry_trolley_events (
  trolley_no, event_type, to_status, location_type, client_name, cycle_id,
  actor_name, occurred_at, metadata
)
select cycle.trolley_no, 'history_imported',
  case
    when cycle.returned_at is not null then 'free_at_laundry'
    when cycle.status = 'at_client' then 'at_client'
    when cycle.released_at is not null then 'in_transit_to_client'
    else 'packed_at_laundry'
  end,
  case
    when cycle.status = 'at_client' and cycle.returned_at is null then 'client'
    when cycle.released_at is not null and cycle.returned_at is null then 'vehicle'
    else 'laundry'
  end,
  cycle.client_name, cycle.id,
  coalesce(cycle.returned_by, cycle.delivered_by, cycle.released_by, cycle.packed_by, 'Migracja'),
  coalesce(cycle.returned_at, cycle.delivered_at, cycle.released_at, cycle.packed_at, cycle.created_at),
  jsonb_build_object('source', 'legacy_cycle', 'load_kind', cycle.load_kind)
from public.laundry_trolley_cycles cycle
where lower(cycle.trolley_no) not in ('brak', 'bez wózka')
  and not exists (
    select 1 from public.laundry_trolley_events event
    where event.cycle_id = cycle.id
  );

-- Przed migracją nie istniał osobny moment przyjęcia z kursu. Aktywne starsze
-- przyjazdy traktujemy jako już znajdujące się na pralni.
update public.entries
set dirty_received_at = coalesce(dirty_received_at, added_at, now()),
    dirty_received_by = coalesce(dirty_received_by, added_by, 'Migracja')
where dirty_received_at is null
  and deleted_at is null
  and not coalesce(washed, false)
  and nullif(trim(coalesce(arrival_trolley_nos, '')), '') is not null;

insert into public.laundry_trolley_events (
  trolley_no, event_type, to_status, location_type, client_name, entry_id,
  actor_name, occurred_at, metadata
)
select distinct trim(number.value), 'history_imported', 'dirty_at_laundry', 'laundry',
  entry.client_name, entry.id, coalesce(entry.dirty_received_by, entry.added_by, 'Migracja'),
  coalesce(entry.dirty_received_at, entry.added_at, now()),
  jsonb_build_object('source', 'legacy_dirty_arrival')
from public.entries entry
cross join lateral unnest(string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')) number(value)
where entry.deleted_at is null
  and not coalesce(entry.washed, false)
  and nullif(trim(number.value), '') is not null
  and not exists (
    select 1 from public.laundry_trolley_events event
    where event.entry_id = entry.id and lower(event.trolley_no) = lower(trim(number.value))
  );

-- Waga wpisywana przez kierowcę jest od tej migracji wagą brutto. Istniejące
-- rekordy zachowują dotychczasowe netto, bo arrival_gross_kg pozostaje NULL.
create or replace function public.admin_insert_entry(
  p_session_token text,
  p_id text,
  p_week_key text,
  p_client_name text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_type text,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false,
  p_added_by text default null,
  p_arrival_trolley_nos text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_resolved json;
  v_trolleys integer;
  v_nos text;
  v_tare numeric := 0;
  v_net numeric;
begin
  perform * from public.require_driver(p_session_token);
  if nullif(trim(coalesce(p_id, '')), '') is null then return json_build_object('error', 'Brak id wpisu'); end if;
  if nullif(trim(coalesce(p_client_name, '')), '') is null then return json_build_object('error', 'Brak klienta'); end if;

  v_resolved := public.resolve_arrival_trolleys(p_client_name, p_arrival_trolley_nos, p_added_by);
  if v_resolved->>'error' is not null then return v_resolved; end if;
  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 0));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');
  if v_nos is null and coalesce(p_trolleys, 0) > 0 then v_trolleys := p_trolleys; end if;
  v_tare := private.arrival_tare_kg(v_nos, v_trolleys);

  if p_weight is not null and p_weight < v_tare then
    return json_build_object('error', format('Waga brutto (%s kg) nie może być mniejsza od tary wózków (%s kg)', p_weight, v_tare));
  end if;
  v_net := case when p_weight is null then null else round(greatest(0, p_weight - v_tare), 2) end;

  insert into public.entries (
    id, week_key, client_name, arr_day, pick_day, pick_week_key,
    weight, arrival_gross_kg, arrival_tare_kg, route_id, type, trolleys,
    arrival_trolley_nos, added_by, urgent
  ) values (
    p_id, p_week_key, p_client_name, p_arr_day, p_pick_day, p_pick_week_key,
    v_net, p_weight, v_tare, p_route_id, coalesce(p_type, 'P'), v_trolleys,
    v_nos, nullif(trim(coalesce(p_added_by, '')), ''), coalesce(p_urgent, false)
  );

  return json_build_object('ok', true, 'id', p_id, 'gross_kg', p_weight, 'tare_kg', v_tare, 'net_kg', v_net);
end;
$$;

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
  v_resolved json;
  v_trolleys integer;
  v_nos text;
  v_tare numeric := 0;
  v_net numeric;
begin
  select * into v_user from public.require_driver(p_session_token) limit 1;
  v_resolved := public.resolve_arrival_trolleys(p_client_name, p_arrival_trolley_nos, v_user.name);
  if v_resolved->>'error' is not null then return v_resolved; end if;
  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 0));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');
  if v_nos is null and coalesce(p_trolleys, 0) > 0 then v_trolleys := p_trolleys; end if;
  v_tare := private.arrival_tare_kg(v_nos, v_trolleys);

  if p_weight is not null and p_weight < v_tare then
    return json_build_object('error', format('Waga brutto (%s kg) nie może być mniejsza od tary wózków (%s kg)', p_weight, v_tare));
  end if;
  v_net := case when p_weight is null then null else round(greatest(0, p_weight - v_tare), 2) end;

  update public.entries set
    client_name = p_client_name, type = p_type, arr_day = p_arr_day,
    pick_day = p_pick_day, pick_week_key = p_pick_week_key, route_id = p_route_id,
    weight = v_net, arrival_gross_kg = p_weight, arrival_tare_kg = v_tare,
    trolleys = v_trolleys, arrival_trolley_nos = v_nos,
    urgent = coalesce(p_urgent, false)
  where id = p_id;
  if not found then return json_build_object('error', 'Nie znaleziono wpisu'); end if;

  return json_build_object('ok', true, 'gross_kg', p_weight, 'tare_kg', v_tare, 'net_kg', v_net);
end;
$$;

create or replace function public.get_trolley_history(
  p_session_token text,
  p_trolley_no text,
  p_limit integer default 200
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trolley record;
  v_events json;
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Laundry data session required' using errcode = '42501';
  end if;

  select * into v_trolley from public.laundry_trolleys
  where lower(trolley_no) = lower(trim(p_trolley_no)) limit 1;
  if v_trolley.trolley_no is null then return json_build_object('error', 'Wózek nie istnieje'); end if;

  select coalesce(json_agg(row_to_json(event_row)), '[]'::json) into v_events
  from (
    select id, trolley_no, event_type, from_status, to_status, location_type,
      client_name, entry_id, cycle_id, actor_name, occurred_at, metadata
    from public.laundry_trolley_events
    where lower(trolley_no) = lower(trim(p_trolley_no))
    order by occurred_at desc, created_at desc
    limit v_limit
  ) event_row;

  return json_build_object('ok', true, 'trolley', row_to_json(v_trolley), 'events', v_events);
end;
$$;

-- Dostawa czystego może opcjonalnie zabrać dodatkowe puste wózki. Wywołanie
-- opakowuje istniejącą dostawę, więc całość zapisuje się w jednej transakcji.
create or replace function public.driver_deliver_entries_with_empty_trolleys(
  p_session_token text,
  p_ids text[],
  p_trolley_actions jsonb default '[]'::jsonb,
  p_empty_trolley_nos text[] default array[]::text[]
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_result json;
  v_client_name text;
  v_no text;
  v_existing record;
  v_cycle public.laundry_trolley_cycles;
  v_created jsonb := '[]'::jsonb;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  v_result := public.driver_deliver_entries(p_session_token, p_ids, p_trolley_actions);
  if v_result->>'error' is not null then raise exception '%', v_result->>'error'; end if;
  if coalesce((v_result->>'affected')::integer, 0) = 0 then return v_result; end if;

  select min(client_name) into v_client_name from public.entries where id = any(p_ids);
  foreach v_no in array coalesce(p_empty_trolley_nos, array[]::text[]) loop
    v_no := trim(v_no);
    if v_no = '' then continue; end if;
    if not exists (select 1 from public.laundry_trolleys where trolley_no = v_no and active) then
      raise exception 'Wózek % nie istnieje albo jest wycofany', v_no;
    end if;
    perform pg_advisory_xact_lock(hashtextextended(concat('physical-trolley|', lower(v_no)), 0));
    select * into v_existing from private.active_laundry_trolley_cycle(v_no) limit 1;
    if v_existing.id is not null then raise exception 'Wózek % jest zajęty przez %', v_no, v_existing.client_name; end if;
    if exists (select 1 from private.active_arrival_trolley_reservations() reservation where lower(reservation.trolley_no) = lower(v_no)) then
      raise exception 'Wózek % jest zajęty przez brudne pranie', v_no;
    end if;

    insert into public.laundry_trolley_cycles (
      trolley_no, client_name, entry_ids, total_kg, status, load_kind,
      packed_by, released_by, released_at, delivered_by, delivered_at, notes
    ) values (
      v_no, v_client_name, p_ids, 0, 'at_client', 'empty_transfer',
      v_driver.name, v_driver.name, now(), v_driver.name, now(), 'Pusty transfer do klienta'
    ) returning * into v_cycle;
    v_created := v_created || to_jsonb(v_no);
  end loop;

  return v_result::jsonb || jsonb_build_object('empty_trolleys', v_created);
end;
$$;

-- Cofnięcie dostawy domyka pusty transfer powiązany z tym wpisem, zamiast
-- pozostawiać wózek u klienta po cofniętej operacji.
create or replace function private.cancel_empty_transfer_on_delivery_undo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.delivered, false) and not coalesce(new.delivered, false) then
    update public.laundry_trolley_cycles cycle
    set status = 'canceled', returned_at = now(), returned_by = coalesce(new.delivered_by, old.delivered_by, 'System'), updated_at = now()
    where cycle.load_kind = 'empty_transfer'
      and cycle.returned_at is null
      and new.id = any(cycle.entry_ids);
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_empty_transfer_on_delivery_undo on public.entries;
create trigger cancel_empty_transfer_on_delivery_undo
after update of delivered on public.entries
for each row execute function private.cancel_empty_transfer_on_delivery_undo();

grant execute on function public.admin_insert_entry(text, text, text, text, integer, integer, text, integer, text, numeric, integer, boolean, text, text) to anon, authenticated;
grant execute on function public.admin_update_entry(text, text, text, text, integer, integer, text, integer, numeric, integer, boolean, text) to anon, authenticated;
grant execute on function public.get_trolley_history(text, text, integer) to anon, authenticated;
grant execute on function public.driver_deliver_entries_with_empty_trolleys(text, text[], jsonb, text[]) to anon, authenticated;

revoke all on function private.log_entry_trolley_events() from public, anon, authenticated;
revoke all on function private.log_cycle_trolley_events() from public, anon, authenticated;
revoke all on function private.receive_dirty_trolleys_on_trip_finish() from public, anon, authenticated;
revoke all on function private.cancel_empty_transfer_on_delivery_undo() from public, anon, authenticated;

commit;
