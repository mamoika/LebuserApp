begin;

create or replace function private.guard_arrival_trolley_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_arrival_date date;
  v_no text;
  v_conflicting_client text;
begin
  if new.deleted_at is not null
     or nullif(trim(coalesce(new.arrival_trolley_nos, '')), '') is null
     or coalesce(new.washed, false)
     or new.laundry_ready_at is not null
     or new.laundry_packed_at is not null
     or coalesce(new.laundry_status, 'pending') in (
       'washed', 'packed', 'released', 'at_client', 'returned'
     ) then
    return new;
  end if;

  v_arrival_date := private.entry_arrival_date(new.week_key, new.arr_day);
  if v_arrival_date is null then
    raise exception 'Nie można ustalić daty przyjazdu wózka' using errcode = '22007';
  end if;

  for v_no in
    select distinct trim(value)
    from unnest(string_to_array(new.arrival_trolley_nos, ',')) as value
    where nullif(trim(value), '') is not null
    order by trim(value)
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        concat('arrival-trolley|', v_arrival_date::text, '|', lower(v_no)),
        0
      )
    );

    select reservation.client_name
    into v_conflicting_client
    from private.active_arrival_trolley_reservations(v_arrival_date) reservation
    where lower(reservation.trolley_no) = lower(v_no)
      and reservation.entry_id is distinct from new.id
      and reservation.client_name is distinct from new.client_name
    limit 1;

    if v_conflicting_client is not null then
      raise exception 'Wózek % jest już przypisany do klienta % w dniu %',
        v_no,
        v_conflicting_client,
        to_char(v_arrival_date, 'DD.MM.YYYY')
        using errcode = '23505';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.guard_arrival_trolley_reservation()
from public, anon, authenticated;

drop trigger if exists entries_guard_arrival_trolley_reservation on public.entries;
create trigger entries_guard_arrival_trolley_reservation
before insert or update of
  arrival_trolley_nos,
  client_name,
  week_key,
  arr_day,
  deleted_at,
  washed,
  laundry_ready_at,
  laundry_packed_at,
  laundry_status
on public.entries
for each row execute function private.guard_arrival_trolley_reservation();

commit;
