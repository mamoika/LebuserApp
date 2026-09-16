begin;

-- A trolley carrying dirty laundry is a global physical reservation. The
-- arrival date and later workflow statuses do not release it; only marking
-- every linked entry as washed (or deleting the entry) does.
create or replace function private.active_arrival_trolley_reservations()
returns table (trolley_no text, client_name text, entry_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct trim(number.value), entry.client_name, entry.id
  from public.entries entry
  cross join lateral unnest(
    string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')
  ) as number(value)
  where nullif(trim(number.value), '') is not null
    and entry.deleted_at is null
    and not coalesce(entry.washed, false)
$$;

revoke all on function private.active_arrival_trolley_reservations()
from public, anon, authenticated;

-- Keep the public signature compatible with already deployed clients. The
-- requested date is returned for context, but reservations are global.
create or replace function public.get_arrival_trolley_reservations(
  p_session_token text,
  p_arrival_date date
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_reservations json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Laundry data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(reservation)), '[]'::json)
  into v_reservations
  from (
    select trolley_no, client_name, entry_id
    from private.active_arrival_trolley_reservations()
    order by case when trolley_no ~ '^[0-9]+$' then trolley_no::integer else 2147483647 end,
             trolley_no,
             client_name
  ) reservation;

  return json_build_object(
    'ok', true,
    'arrival_date', p_arrival_date,
    'reservation_scope', 'until_washed',
    'reservations', v_reservations
  );
end;
$$;

grant execute on function public.get_arrival_trolley_reservations(text, date)
to anon, authenticated;

create or replace function private.guard_arrival_trolley_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_no text;
  v_conflicting_client text;
begin
  if new.deleted_at is not null
     or nullif(trim(coalesce(new.arrival_trolley_nos, '')), '') is null
     or coalesce(new.washed, false) then
    return new;
  end if;

  for v_no in
    select distinct trim(value)
    from unnest(string_to_array(new.arrival_trolley_nos, ',')) as value
    where nullif(trim(value), '') is not null
    order by trim(value)
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        concat('arrival-trolley|', lower(v_no)),
        0
      )
    );

    select reservation.client_name
    into v_conflicting_client
    from private.active_arrival_trolley_reservations() reservation
    where lower(reservation.trolley_no) = lower(v_no)
      and reservation.entry_id is distinct from new.id
    limit 1;

    if v_conflicting_client is not null then
      raise exception 'Wózek % jest zajęty przez pranie klienta % do czasu oznaczenia go jako wyprane',
        v_no,
        v_conflicting_client
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
  deleted_at,
  washed
on public.entries
for each row execute function private.guard_arrival_trolley_reservation();

drop function if exists private.active_arrival_trolley_reservations(date);

commit;
