begin;

create or replace function public.admin_assign_trolley_to_client(
  p_session_token text,
  p_trolley_no text,
  p_client_id uuid,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_no text := nullif(trim(coalesce(p_trolley_no, '')), '');
  v_by text;
  v_client public.clients;
  v_existing public.laundry_trolley_cycles;
  v_reservation record;
  v_cycle public.laundry_trolley_cycles;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role <> 'admin' then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if v_no is null or lower(v_no) in ('brak', 'bez wózka') then
    return json_build_object('error', 'Wybierz fizyczny numer wózka');
  end if;
  if p_client_id is null then
    return json_build_object('error', 'Wybierz klienta');
  end if;

  select * into v_client
  from public.clients client
  where client.id = p_client_id
    and client.archived_at is null;
  if v_client.id is null then
    return json_build_object('error', 'Klient nie istnieje albo jest zarchiwizowany');
  end if;
  if not exists (
    select 1 from public.laundry_trolleys trolley
    where lower(trolley.trolley_no) = lower(v_no) and trolley.active
  ) then
    return json_build_object('error', 'Wózek nie istnieje albo jest wycofany');
  end if;

  v_by := coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name);
  perform pg_advisory_xact_lock(hashtextextended(concat('physical-trolley|', lower(v_no)), 0));
  perform pg_advisory_xact_lock(hashtextextended(concat('arrival-trolley|', lower(v_no)), 0));

  select * into v_existing
  from private.active_laundry_trolley_cycle(v_no)
  limit 1;
  if v_existing.id is not null then
    return json_build_object(
      'error',
      format('Wózek %s jest już zajęty przez %s. Najpierw zwolnij jego obecne przypisanie.', v_no, v_existing.client_name)
    );
  end if;

  select * into v_reservation
  from private.active_arrival_trolley_reservations() reservation
  where lower(reservation.trolley_no) = lower(v_no)
  limit 1;
  if v_reservation.entry_id is not null then
    return json_build_object(
      'error',
      format('Wózek %s jest zajęty przez brudne pranie klienta %s', v_no, v_reservation.client_name)
    );
  end if;

  insert into public.laundry_trolley_cycles (
    trolley_no, client_name, entry_ids, total_kg, status, load_kind,
    packed_by, packed_at, released_by, released_at, delivered_by, delivered_at, notes
  ) values (
    v_no, v_client.name, array[]::text[], 0, 'at_client', 'empty_transfer',
    v_by, now(), v_by, now(), v_by, now(), 'Ręczne przypisanie wózka do klienta'
  ) returning * into v_cycle;

  return json_build_object(
    'ok', true,
    'trolley_no', v_no,
    'client_id', v_client.id,
    'client_name', v_client.name,
    'cycle_id', v_cycle.id
  );
end;
$$;

revoke all on function public.admin_assign_trolley_to_client(text, text, uuid, text) from public;
grant execute on function public.admin_assign_trolley_to_client(text, text, uuid, text) to anon, authenticated;

commit;
