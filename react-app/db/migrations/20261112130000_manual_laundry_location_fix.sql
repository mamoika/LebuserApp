-- Wpis dodany bezpośrednio z panelu Pralni nie odbywa kursu samochodem.
-- Jest od razu fizycznie na pralni, nawet jeśli administrator przypisał mu
-- wózki przyjazdowe. Migracja naprawia także wpisy utworzone wcześniej.

create or replace function private.receive_manual_laundry_at_laundry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.laundry_planned_date is not null and new.dirty_received_at is null then
    new.dirty_received_at := now();
    new.dirty_received_by := coalesce(new.dirty_received_by, new.added_by, 'Administrator');
  end if;
  return new;
end;
$$;

drop trigger if exists receive_manual_laundry_at_laundry on public.entries;
create trigger receive_manual_laundry_at_laundry
before insert or update of laundry_planned_date
on public.entries
for each row execute function private.receive_manual_laundry_at_laundry();

create or replace function private.log_manual_laundry_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no text;
begin
  if new.laundry_planned_date is null
     or (tg_op = 'UPDATE' and old.laundry_planned_date is not null) then
    return new;
  end if;

  for v_no in
    select distinct trim(value)
    from unnest(string_to_array(coalesce(new.arrival_trolley_nos, ''), ',')) value
    where nullif(trim(value), '') is not null
  loop
    perform private.record_trolley_event(
      v_no,
      'dirty_received_at_laundry',
      'returning_to_laundry',
      'dirty_at_laundry',
      'laundry',
      new.client_name,
      new.id,
      null,
      coalesce(new.dirty_received_by, new.added_by, 'Administrator'),
      coalesce(new.dirty_received_at, now()),
      jsonb_build_object('source', 'manual_laundry_plan')
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists log_manual_laundry_received on public.entries;
create trigger log_manual_laundry_received
after insert or update of laundry_planned_date
on public.entries
for each row execute function private.log_manual_laundry_received();

update public.entries
set dirty_received_at = coalesce(dirty_received_at, added_at, now()),
    dirty_received_by = coalesce(dirty_received_by, added_by, 'Administrator')
where laundry_planned_date is not null
  and dirty_received_at is null
  and deleted_at is null;

insert into public.laundry_trolley_events (
  trolley_no,
  event_type,
  from_status,
  to_status,
  location_type,
  client_name,
  entry_id,
  actor_name,
  occurred_at,
  metadata
)
select distinct
  trim(number.value),
  'dirty_received_at_laundry',
  'returning_to_laundry',
  'dirty_at_laundry',
  'laundry',
  entry.client_name,
  entry.id,
  coalesce(entry.dirty_received_by, entry.added_by, 'Administrator'),
  coalesce(entry.dirty_received_at, entry.added_at, now()),
  jsonb_build_object('source', 'manual_laundry_plan_backfill')
from public.entries entry
cross join lateral unnest(string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')) number(value)
where entry.laundry_planned_date is not null
  and entry.deleted_at is null
  and nullif(trim(number.value), '') is not null
  and not exists (
    select 1
    from public.laundry_trolley_events event
    where event.entry_id = entry.id
      and lower(event.trolley_no) = lower(trim(number.value))
      and event.event_type = 'dirty_received_at_laundry'
  );
