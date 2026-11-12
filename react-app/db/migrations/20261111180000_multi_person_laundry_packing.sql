-- ============================================================
--  Pralnia: wieloosobowe pakowanie wózków (Kontynuuj / Zakończ)
--
--  Umożliwia pakowanie jednego hotelu przez kilka osób jednocześnie
--  lub w kilku etapach:
--  - p_finish = false: zapisuje wózek (cykl), ale nie zamyka hotelu
--    (hotel pozostaje w toku, kierowca jeszcze go nie odbiera).
--  - p_finish = true: zapisuje wózek i oznacza hotel jako gotowy do odbioru.
--  - admin_finish_laundry_packing: kończy pakowanie bez konieczności
--    dodawania kolejnego wózka (gdy wszystkie wózki spakowano wcześniej).
-- ============================================================

drop function if exists public.admin_pack_laundry_trolley(text, text[], text, numeric, text);

create or replace function public.admin_pack_laundry_trolley(
  p_session_token text,
  p_ids text[],
  p_trolley_no text,
  p_kg numeric,
  p_by text default null,
  p_finish boolean default null
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

  if p_finish is not null then
    v_is_ready := p_finish;
  else
    v_is_ready := case
      when v_known_weight then v_new_packed_kg + 0.05 >= v_total_kg
      else true
    end;
  end if;

  select string_agg(distinct cycle.trolley_no, ', ' order by cycle.trolley_no)
  into v_trolley_list
  from public.laundry_trolley_cycles cycle
  where (cycle.returned_at is null or cycle.trolley_no = 'brak')
    and cycle.client_name = v_client_name
    and cycle.entry_ids && v_entry_ids;

  update public.entries
  set laundry_status = case when v_is_ready then 'packed' else 'washed' end,
      laundry_packed_at = case when v_is_ready then coalesce(laundry_packed_at, now()) else laundry_packed_at end,
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

create or replace function public.admin_finish_laundry_packing(
  p_session_token text,
  p_ids text[],
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_client_name text;
  v_entry_ids text[];
  v_trolley_list text;
  v_cycle_id uuid;
  v_all_cycles integer;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'packer', 'tunnel') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do zakończenia pakowania');
  end if;

  select
    min(entry.client_name),
    array_agg(entry.id order by entry.id)
  into v_client_name, v_entry_ids
  from public.entries entry
  where entry.id = any(p_ids)
    and entry.deleted_at is null;

  if v_entry_ids is null or array_length(v_entry_ids, 1) is null then
    return json_build_object('error', 'Nie znaleziono wpisów');
  end if;

  select
    string_agg(distinct cycle.trolley_no, ', ' order by cycle.trolley_no),
    (array_agg(cycle.id order by cycle.packed_at desc))[1],
    count(*)
  into v_trolley_list, v_cycle_id, v_all_cycles
  from public.laundry_trolley_cycles cycle
  where (cycle.returned_at is null or cycle.trolley_no = 'brak')
    and cycle.client_name = v_client_name
    and cycle.entry_ids && v_entry_ids;

  update public.entries
  set laundry_status = 'packed',
      laundry_packed_at = coalesce(laundry_packed_at, now()),
      laundry_packed_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      laundry_ready_at = coalesce(laundry_ready_at, now()),
      laundry_trolley_no = coalesce(v_trolley_list, laundry_trolley_no),
      laundry_trolley_cycle_id = coalesce(v_cycle_id, laundry_trolley_cycle_id)
  where id = any(v_entry_ids)
    and deleted_at is null;

  return json_build_object(
    'ok', true,
    'ready', true,
    'trolley_no', v_trolley_list,
    'cycle_count', v_all_cycles
  );
end;
$$;

grant execute on function public.admin_pack_laundry_trolley(text, text[], text, numeric, text, boolean) to anon, authenticated;
grant execute on function public.admin_finish_laundry_packing(text, text[], text) to anon, authenticated;
