begin;

-- Brudne wózki przyjmujemy na pralnię w chwili zakończenia kursu
-- (private.receive_dirty_trolleys_on_trip_finish). Jeśli administrator
-- w korekcie zakończonego kursu dopisze brudne albo doda wózki do wpisu,
-- ten moment już minął i wpis zostawał na zawsze „w pojeździe”.
-- Kurs jest zakończony, więc pranie fizycznie jest już na pralni:
-- przyjmujemy je z datą zakończenia kursu.

create or replace function private.receive_dirty_entry_from_finished_trip(p_entry_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_trip record;
  v_received_at timestamptz;
  v_no text;
begin
  if p_entry_id is null then
    return;
  end if;

  select entry.id, entry.client_name, entry.arrival_trolley_nos
  into v_entry
  from public.entries entry
  where entry.id = p_entry_id
    and entry.deleted_at is null
    and not coalesce(entry.washed, false)
    and entry.dirty_received_at is null
    and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
  for update;

  if v_entry.id is null then
    return;
  end if;

  select trip.id, trip.driver_name,
         coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) as received_at
  into v_trip
  from public.trip_stop_tasks task
  join public.trip_stops stop on stop.id = task.stop_id
  join public.driver_trips trip on trip.id = stop.trip_id
  where task.entry_id = v_entry.id
    and trip.status = 'finished'
  order by coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) desc
  limit 1;

  if v_trip.id is null then
    return;
  end if;

  v_received_at := coalesce(v_trip.received_at, now());

  update public.entries
  set dirty_received_at = v_received_at,
      dirty_received_by = v_trip.driver_name
  where id = v_entry.id
    and dirty_received_at is null;

  for v_no in
    select distinct trim(value)
    from unnest(string_to_array(v_entry.arrival_trolley_nos, ',')) value
    where nullif(trim(value), '') is not null
  loop
    perform private.record_trolley_event(
      v_no,
      'dirty_received_at_laundry',
      'returning_to_laundry',
      'dirty_at_laundry',
      'laundry',
      v_entry.client_name,
      v_entry.id,
      null,
      v_trip.driver_name,
      v_received_at,
      jsonb_build_object('trip_id', v_trip.id, 'source', 'finished_trip_correction')
    );
  end loop;
end;
$$;

revoke execute on function private.receive_dirty_entry_from_finished_trip(text)
  from public, anon, authenticated;

-- Edycja wpisu (np. dodanie wózków) w już zakończonym kursie.
create or replace function private.receive_dirty_on_entry_trolleys_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.arrival_trolley_nos is distinct from old.arrival_trolley_nos then
    perform private.receive_dirty_entry_from_finished_trip(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists receive_dirty_on_entry_trolleys_change on public.entries;
create trigger receive_dirty_on_entry_trolleys_change
after update of arrival_trolley_nos on public.entries
for each row execute function private.receive_dirty_on_entry_trolleys_change();

-- Nowy wpis dopięty do zakończonego kursu przez private.sync_trip_course.
create or replace function private.receive_dirty_on_trip_task_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_id is not null then
    perform private.receive_dirty_entry_from_finished_trip(new.entry_id);
  end if;
  return new;
end;
$$;

drop trigger if exists receive_dirty_on_trip_task_link on public.trip_stop_tasks;
create trigger receive_dirty_on_trip_task_link
after insert or update of entry_id, stop_id on public.trip_stop_tasks
for each row execute function private.receive_dirty_on_trip_task_link();

-- Naprawa wpisów, które już utknęły „w pojeździe” po korekcie zakończonego kursu.
do $$
declare
  v_entry_id text;
begin
  for v_entry_id in
    select distinct entry.id
    from public.entries entry
    join public.trip_stop_tasks task on task.entry_id = entry.id
    join public.trip_stops stop on stop.id = task.stop_id
    join public.driver_trips trip on trip.id = stop.trip_id
    where entry.deleted_at is null
      and not coalesce(entry.washed, false)
      and entry.dirty_received_at is null
      and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
      and trip.status = 'finished'
  loop
    perform private.receive_dirty_entry_from_finished_trip(v_entry_id);
  end loop;
end;
$$;

commit;
