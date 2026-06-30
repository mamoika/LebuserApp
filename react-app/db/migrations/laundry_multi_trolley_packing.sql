-- ============================================================
--  Pralnia: pakowanie jednego klienta w kilka wózków.
--
--  Każde kliknięcie "Spakuj" tworzy osobny cykl wózka z numerem i kg.
--  Hotel staje się gotowy dla kierowcy dopiero, gdy suma aktywnych wózków
--  osiągnie całą wagę prania.
--
--  URUCHOM w Supabase -> SQL Editor po laundry_trolley_count_setting.sql.
-- ============================================================

drop function if exists public.admin_pack_laundry_trolley(text, text[], text, text);

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
set search_path = public, extensions
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
  v_cycle public.laundry_trolley_cycles;
  v_total_kg numeric;
  v_packed_kg numeric := 0;
  v_remaining_kg numeric := 0;
  v_new_packed_kg numeric := 0;
  v_is_ready boolean := false;
  v_trolley_list text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do spakowania');
  end if;

  if v_trolley_no is null then
    return json_build_object('error', 'Podaj numer wózka');
  end if;

  if v_pack_kg <= 0 then
    return json_build_object('error', 'Podaj ile kg wkładasz do tego wózka');
  end if;

  select
    min(e.client_name),
    count(distinct coalesce(e.client_name, '')),
    bool_and(coalesce(e.washed, false) or e.laundry_ready_at is not null or e.laundry_packed_at is not null),
    bool_or(coalesce(e.done, false)),
    array_agg(e.id order by e.id),
    coalesce(sum(coalesce(e.weight, 0)), 0)
  into v_client_name, v_client_count, v_all_washed, v_any_done, v_entry_ids, v_total_kg
  from public.entries e
  where e.id = any(p_ids)
    and e.deleted_at is null;

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

  if v_total_kg <= 0 then
    return json_build_object('error', 'To pranie nie ma podanej wagi');
  end if;

  select *
  into v_existing
  from public.laundry_trolley_cycles
  where lower(trolley_no) = lower(v_trolley_no)
    and returned_at is null
  limit 1;

  if v_existing.id is not null then
    return json_build_object(
      'error',
      format('Wózek %s jest już przypisany do: %s', v_trolley_no, v_existing.client_name)
    );
  end if;

  select coalesce(sum(coalesce(total_kg, 0)), 0)
  into v_packed_kg
  from public.laundry_trolley_cycles
  where returned_at is null
    and client_name = v_client_name
    and entry_ids && v_entry_ids;

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

  insert into public.laundry_trolley_cycles (
    trolley_no, client_name, entry_ids, total_kg, status, packed_by
  )
  values (
    v_trolley_no,
    v_client_name,
    v_entry_ids,
    round(v_pack_kg::numeric, 1),
    'packed',
    coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name)
  )
  returning * into v_cycle;

  v_new_packed_kg := v_packed_kg + v_pack_kg;
  v_is_ready := v_new_packed_kg + 0.05 >= v_total_kg;

  select string_agg(distinct trolley_no, ', ' order by trolley_no)
  into v_trolley_list
  from public.laundry_trolley_cycles
  where returned_at is null
    and client_name = v_client_name
    and entry_ids && v_entry_ids;

  update public.entries
  set laundry_status = case when v_is_ready then 'packed' else 'washed' end,
      laundry_packed_at = case when v_is_ready then now() else laundry_packed_at end,
      laundry_packed_by = case when v_is_ready then coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name) else laundry_packed_by end,
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

grant execute on function public.admin_pack_laundry_trolley(text, text[], text, numeric, text) to anon, authenticated;
