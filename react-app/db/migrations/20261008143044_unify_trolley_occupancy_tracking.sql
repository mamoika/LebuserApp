-- Generated with `supabase migration new unify_trolley_occupancy_tracking`.

begin;

-- One physical trolley number may have only one current location.  Both the
-- clean-laundry cycle and the dirty-arrival workflow use these helpers and the
-- same transaction-level advisory lock.
create or replace function private.active_laundry_trolley_cycle(
  p_trolley_no text
)
returns setof public.laundry_trolley_cycles
language sql
stable
security definer
set search_path = ''
as $$
  select cycle.*
  from public.laundry_trolley_cycles cycle
  where lower(trim(cycle.trolley_no)) = lower(trim(p_trolley_no))
    and cycle.returned_at is null
    and cycle.status not in ('returned', 'canceled')
  order by cycle.packed_at desc
$$;

revoke all on function private.active_laundry_trolley_cycle(text)
from public, anon, authenticated;

create or replace function public.resolve_arrival_trolleys(
  p_client_name text,
  p_arrival_trolley_nos text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nos text[];
  v_no text;
  v_cycle public.laundry_trolley_cycles;
  v_by text := nullif(trim(coalesce(p_by, '')), '');
begin
  if nullif(trim(coalesce(p_arrival_trolley_nos, '')), '') is null then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  select coalesce(array_agg(distinct trim(x) order by trim(x)), array[]::text[])
  into v_nos
  from unnest(string_to_array(p_arrival_trolley_nos, ',')) as x
  where nullif(trim(x), '') is not null;

  if coalesce(array_length(v_nos, 1), 0) = 0 then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  foreach v_no in array v_nos loop
    perform pg_advisory_xact_lock(
      hashtextextended(concat('physical-trolley|', lower(v_no)), 0)
    );

    select * into v_cycle
    from private.active_laundry_trolley_cycle(v_no)
    limit 1;

    if v_cycle.id is null then
      continue;
    end if;

    if v_cycle.status = 'at_client' then
      if v_cycle.client_name is distinct from p_client_name then
        return json_build_object(
          'error',
          format('Wózek %s jest u klienta: %s', v_no, v_cycle.client_name)
        );
      end if;

      update public.laundry_trolley_cycles
      set status = 'returned',
          returned_by = coalesce(v_by, 'system'),
          returned_at = now(),
          updated_at = now()
      where id = v_cycle.id;

      update public.entries
      set laundry_status = 'returned'
      where id = any(v_cycle.entry_ids);
    else
      return json_build_object(
        'error',
        format('Wózek %s jest zajęty przez: %s', v_no, v_cycle.client_name)
      );
    end if;
  end loop;

  return json_build_object(
    'ok', true,
    'trolleys', array_length(v_nos, 1),
    'nos', array_to_string(v_nos, ', ')
  );
end;
$$;

-- Internal RPC helper: only authenticated entry-writing functions may call it.
revoke execute on function public.resolve_arrival_trolleys(text, text, text)
from public, anon, authenticated;

create or replace function private.guard_arrival_trolley_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
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
      hashtextextended(concat('physical-trolley|', lower(v_no)), 0)
    );

    select cycle.client_name into v_conflicting_client
    from private.active_laundry_trolley_cycle(v_no) cycle
    limit 1;

    if v_conflicting_client is not null then
      raise exception 'Wózek % jest już zajęty przez %', v_no, v_conflicting_client
        using errcode = '23505';
    end if;

    select reservation.client_name
    into v_conflicting_client
    from private.active_arrival_trolley_reservations() reservation
    where lower(reservation.trolley_no) = lower(v_no)
      and reservation.entry_id is distinct from new.id
    limit 1;

    if v_conflicting_client is not null then
      raise exception 'Wózek % jest zajęty przez brudne pranie klienta % do czasu oznaczenia go jako wyprane',
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

create or replace function public.get_laundry_workflow(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_trolleys json;
  v_arrival_reservations json;
  v_trolley_count integer := 25;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Admin data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_trolleys
  from (
    select
      cycle.*,
      coalesce((
        select bool_or(entry.delivered_at is not null or coalesce(entry.delivered, false) or coalesce(entry.done, false))
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ), false) as is_delivered,
      coalesce((
        select bool_or(entry.picked_at is not null or entry.delivered_at is not null or coalesce(entry.delivered, false) or coalesce(entry.done, false))
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ), false) as is_issued_to_driver,
      (
        select max(entry.delivered_at)
        from public.entries entry
        where entry.id = any(cycle.entry_ids) and entry.deleted_at is null
      ) as entry_delivered_at,
      (
        select string_agg(distinct entry.picked_by, ', ')
        from public.entries entry
        where entry.id = any(cycle.entry_ids)
          and entry.deleted_at is null
          and entry.picked_by is not null
          and trim(entry.picked_by) <> ''
      ) as driver_name
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
       or cycle.packed_at >= now() - interval '30 days'
    order by cycle.returned_at nulls first, cycle.packed_at desc
    limit 300
  ) x;

  select coalesce(json_agg(row_to_json(reservation)), '[]'::json)
  into v_arrival_reservations
  from (
    select trolley_no, client_name, entry_id
    from private.active_arrival_trolley_reservations()
    order by case when trolley_no ~ '^[0-9]+$' then trolley_no::integer else 2147483647 end,
             trolley_no,
             client_name
  ) reservation;

  begin
    select case
      when jsonb_typeof(setting.value) = 'number' then setting.value::text::integer
      when jsonb_typeof(setting.value) = 'string'
        and trim(both '"' from setting.value::text) ~ '^[0-9]+$'
        then trim(both '"' from setting.value::text)::integer
      else 25
    end
    into v_trolley_count
    from public.app_settings setting
    where setting.key = 'laundry_trolley_count';
  exception
    when others then
      v_trolley_count := 25;
  end;

  v_trolley_count := greatest(1, least(99, coalesce(v_trolley_count, 25)));

  return json_build_object(
    'ok', true,
    'trolleys', v_trolleys,
    'arrival_reservations', v_arrival_reservations,
    'trolley_count', v_trolley_count
  );
end;
$$;

revoke execute on function public.get_laundry_workflow(text) from public;
grant execute on function public.get_laundry_workflow(text) to anon, authenticated;

create or replace function public.admin_pack_laundry_trolley(
  p_session_token text,
  p_ids text[],
  p_trolley_no text,
  p_kg numeric,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_trolley_no text := nullif(trim(coalesce(p_trolley_no, '')), '');
  v_pack_kg numeric := coalesce(p_kg, 0);
  v_client_name text;
  v_client_count integer;
  v_all_washed boolean;
  v_any_done boolean;
  v_entry_ids text[];
  v_existing public.laundry_trolley_cycles;
  v_reservation record;
  v_cycle public.laundry_trolley_cycles;
  v_total_kg numeric;
  v_packed_kg numeric := 0;
  v_remaining_kg numeric := 0;
  v_new_packed_kg numeric := 0;
  v_is_ready boolean := false;
  v_trolley_list text;
  v_known_weight boolean;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'packer', 'tunnel') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do spakowania');
  end if;

  if v_trolley_no is null
     or lower(v_trolley_no) in ('brak', 'bez wózka') then
    v_trolley_no := 'brak';
  end if;

  select
    min(entry.client_name),
    count(distinct coalesce(entry.client_name, '')),
    bool_and(coalesce(entry.washed, false) or entry.laundry_ready_at is not null or entry.laundry_packed_at is not null),
    bool_or(coalesce(entry.done, false)),
    array_agg(entry.id order by entry.id),
    coalesce(sum(coalesce(entry.weight, 0)), 0)
  into v_client_name, v_client_count, v_all_washed, v_any_done, v_entry_ids, v_total_kg
  from public.entries entry
  where entry.id = any(p_ids)
    and entry.deleted_at is null;

  if v_entry_ids is null or array_length(v_entry_ids, 1) is null then
    return json_build_object('error', 'Nie znaleziono wpisów');
  end if;

  if v_client_count <> 1 then
    return json_build_object('error', 'Jeden wózek można przypisać tylko do jednego klienta');
  end if;

  if not coalesce(v_all_washed, false) then
    return json_build_object('error', 'Najpierw oznacz pranie jako wyprane');
  end if;

  if coalesce(v_any_done, false) then
    return json_build_object('error', 'Tego prania nie można spakować, bo kierowca już je odebrał');
  end if;

  v_known_weight := v_total_kg > 0;

  if v_known_weight and v_pack_kg <= 0 then
    return json_build_object('error', 'Podaj ile kg pakujesz');
  end if;

  if v_trolley_no <> 'brak' then
    perform pg_advisory_xact_lock(
      hashtextextended(concat('physical-trolley|', lower(v_trolley_no)), 0)
    );

    select * into v_existing
    from private.active_laundry_trolley_cycle(v_trolley_no)
    limit 1;

    if v_existing.id is not null then
      return json_build_object(
        'error',
        format('Wózek %s jest już przypisany do: %s', v_trolley_no, v_existing.client_name)
      );
    end if;

    select * into v_reservation
    from private.active_arrival_trolley_reservations() reservation
    where lower(reservation.trolley_no) = lower(v_trolley_no)
    limit 1;

    if v_reservation.entry_id is not null then
      return json_build_object(
        'error',
        format(
          'Wózek %s jest zajęty przez brudne pranie klienta: %s',
          v_trolley_no,
          v_reservation.client_name
        )
      );
    end if;
  end if;

  if v_known_weight then
    select coalesce(sum(coalesce(cycle.total_kg, 0)), 0)
    into v_packed_kg
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
      and cycle.client_name = v_client_name
      and cycle.entry_ids && v_entry_ids;

    v_remaining_kg := greatest(0, v_total_kg - v_packed_kg);

    if v_remaining_kg <= 0.05 then
      return json_build_object('error', 'To pranie jest już spakowane');
    end if;

    if v_pack_kg > v_remaining_kg + 0.05 then
      return json_build_object(
        'error',
        format('Do spakowania zostało %s kg', to_char(v_remaining_kg, 'FM999999990.0'))
      );
    end if;
  end if;

  insert into public.laundry_trolley_cycles (
    trolley_no, client_name, entry_ids, total_kg, status, packed_by
  )
  values (
    v_trolley_no,
    v_client_name,
    v_entry_ids,
    round(v_pack_kg::numeric, 1),
    case when v_trolley_no = 'brak' then 'returned' else 'packed' end,
    coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name)
  )
  returning * into v_cycle;

  if v_trolley_no = 'brak' then
    update public.laundry_trolley_cycles
    set returned_at = now()
    where id = v_cycle.id;
  end if;

  v_new_packed_kg := v_packed_kg + v_pack_kg;
  v_is_ready := case
    when v_known_weight then v_new_packed_kg + 0.05 >= v_total_kg
    else true
  end;

  select string_agg(distinct cycle.trolley_no, ', ' order by cycle.trolley_no)
  into v_trolley_list
  from public.laundry_trolley_cycles cycle
  where (cycle.returned_at is null or cycle.trolley_no = 'brak')
    and cycle.client_name = v_client_name
    and cycle.entry_ids && v_entry_ids;

  update public.entries
  set laundry_status = case when v_is_ready then 'packed' else 'washed' end,
      laundry_packed_at = case when v_is_ready then now() else laundry_packed_at end,
      laundry_packed_by = case
        when v_is_ready then coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name)
        else laundry_packed_by
      end,
      laundry_ready_at = case when v_is_ready then coalesce(laundry_ready_at, now()) else laundry_ready_at end,
      laundry_trolley_no = case when v_is_ready then v_trolley_list else laundry_trolley_no end,
      laundry_trolley_cycle_id = case when v_is_ready then v_cycle.id else laundry_trolley_cycle_id end
  where id = any(v_entry_ids)
    and deleted_at is null;

  return json_build_object(
    'ok', true,
    'trolley', row_to_json(v_cycle),
    'packed_kg', round(v_new_packed_kg::numeric, 1),
    'remaining_kg', round(greatest(0, v_total_kg - v_new_packed_kg)::numeric, 1),
    'ready', v_is_ready
  );
end;
$$;

revoke execute on function public.admin_pack_laundry_trolley(text, text[], text, numeric, text)
from public;
grant execute on function public.admin_pack_laundry_trolley(text, text[], text, numeric, text)
to anon, authenticated;

-- If a packed trolley is explicitly left in the laundry, do not keep its old
-- number on the route entry.  Otherwise a later delivery misleadingly claims
-- that the trolley travelled with the driver after the cycle was closed.
create or replace function private.clear_left_laundry_trolley_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.returned_at is null
     and new.returned_at is not null
     and old.status in ('packed', 'released') then
    update public.entries
    set laundry_trolley_cycle_id = null,
        laundry_trolley_no = 'brak'
    where id = any(new.entry_ids)
      and coalesce(delivered, false) = false;
  end if;

  return new;
end;
$$;

revoke all on function private.clear_left_laundry_trolley_reference()
from public, anon, authenticated;

drop trigger if exists laundry_trolley_clear_left_reference
on public.laundry_trolley_cycles;
create trigger laundry_trolley_clear_left_reference
after update of status, returned_at on public.laundry_trolley_cycles
for each row
execute function private.clear_left_laundry_trolley_reference();

commit;
