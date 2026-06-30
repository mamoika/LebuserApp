-- ============================================================
--  Pralnia: cofanie błędnych kroków operatora.
--
--  Nie kasujemy historii. Cofnięte pakowanie dostaje status "canceled",
--  wózek wraca do puli wolnych numerów, a status hotelu jest przeliczany
--  z aktywnych wózków i ich kg.
--
--  URUCHOM w Supabase -> SQL Editor po laundry_multi_trolley_packing.sql.
-- ============================================================

create or replace function public.recalculate_laundry_status_for_entries(
  p_entry_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_entry_ids text[];
  v_total_kg numeric := 0;
  v_packed_kg numeric := 0;
  v_all_washed boolean := false;
  v_trolley_list text;
  v_cycle_id uuid;
begin
  select
    array_agg(e.id order by e.id),
    coalesce(sum(coalesce(e.weight, 0)), 0),
    bool_and(coalesce(e.washed, false))
  into v_entry_ids, v_total_kg, v_all_washed
  from public.entries e
  where e.id = any(p_entry_ids)
    and e.deleted_at is null
    and coalesce(e.done, false) = false
    and coalesce(e.delivered, false) = false;

  if v_entry_ids is null or array_length(v_entry_ids, 1) is null then
    return;
  end if;

  select
    coalesce(sum(coalesce(c.total_kg, 0)), 0),
    string_agg(distinct c.trolley_no, ', ' order by c.trolley_no),
    (array_agg(c.id order by c.packed_at desc))[1]
  into v_packed_kg, v_trolley_list, v_cycle_id
  from public.laundry_trolley_cycles c
  where c.returned_at is null
    and coalesce(c.status, '') <> 'canceled'
    and c.entry_ids && v_entry_ids;

  if v_total_kg > 0 and v_packed_kg + 0.05 >= v_total_kg then
    update public.entries
    set laundry_status = 'packed',
        laundry_ready_at = coalesce(laundry_ready_at, now()),
        laundry_packed_at = coalesce(laundry_packed_at, now()),
        laundry_trolley_no = v_trolley_list,
        laundry_trolley_cycle_id = v_cycle_id
    where id = any(v_entry_ids);
  elsif coalesce(v_all_washed, false) then
    update public.entries
    set laundry_status = 'washed',
        laundry_ready_at = null,
        laundry_packed_at = null,
        laundry_packed_by = null,
        laundry_trolley_no = null,
        laundry_trolley_cycle_id = null
    where id = any(v_entry_ids);
  else
    update public.entries
    set laundry_status = 'pending',
        laundry_ready_at = null,
        laundry_packed_at = null,
        laundry_packed_by = null,
        laundry_trolley_no = null,
        laundry_trolley_cycle_id = null
    where id = any(v_entry_ids);
  end if;
end;
$$;

create or replace function public.admin_unmark_laundry_washed(
  p_session_token text,
  p_ids text[],
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_entry_ids text[];
  v_has_driver_step boolean := false;
  v_by text;
  v_count integer := 0;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do cofnięcia');
  end if;

  select
    array_agg(e.id order by e.id),
    bool_or(coalesce(e.done, false) or coalesce(e.delivered, false))
  into v_entry_ids, v_has_driver_step
  from public.entries e
  where e.id = any(p_ids)
    and e.deleted_at is null;

  if v_entry_ids is null or array_length(v_entry_ids, 1) is null then
    return json_build_object('error', 'Nie znaleziono wpisów');
  end if;

  if coalesce(v_has_driver_step, false) then
    return json_build_object('error', 'Najpierw cofnij odbiór/dostawę u kierowcy');
  end if;

  v_by := coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name);

  update public.laundry_trolley_cycles
  set status = 'canceled',
      returned_by = v_by,
      returned_at = coalesce(returned_at, now()),
      notes = nullif(concat_ws(' | ', notes, 'cofnięto razem z wypraniem'), ''),
      updated_at = now()
  where returned_at is null
    and coalesce(status, '') <> 'canceled'
    and entry_ids && v_entry_ids;

  update public.entries
  set washed = false,
      washed_at = null,
      washed_by = null,
      laundry_status = 'pending',
      laundry_packed_at = null,
      laundry_packed_by = null,
      laundry_ready_at = null,
      laundry_trolley_no = null,
      laundry_trolley_cycle_id = null
  where id = any(v_entry_ids)
    and deleted_at is null
    and coalesce(done, false) = false
    and coalesce(delivered, false) = false;

  get diagnostics v_count = row_count;

  return json_build_object('ok', true, 'affected', v_count);
end;
$$;

create or replace function public.admin_cancel_laundry_trolley(
  p_session_token text,
  p_cycle_id uuid,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_cycle public.laundry_trolley_cycles;
  v_by text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.laundry_trolley_cycles
  where id = p_cycle_id
  limit 1;

  if v_cycle.id is null then
    return json_build_object('error', 'Nie znaleziono wózka');
  end if;

  if v_cycle.status = 'canceled' then
    return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
  end if;

  if v_cycle.returned_at is not null then
    return json_build_object('error', 'Ten wózek już wrócił. Najpierw cofnij powrót, potem pakowanie.');
  end if;

  v_by := coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name);

  update public.laundry_trolley_cycles
  set status = 'canceled',
      returned_by = v_by,
      returned_at = now(),
      notes = nullif(concat_ws(' | ', notes, 'cofnięto pakowanie'), ''),
      updated_at = now()
  where id = p_cycle_id
  returning * into v_cycle;

  perform public.recalculate_laundry_status_for_entries(v_cycle.entry_ids);

  return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
end;
$$;

create or replace function public.admin_undo_return_laundry_trolley(
  p_session_token text,
  p_cycle_id uuid,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_cycle public.laundry_trolley_cycles;
  v_conflict text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.laundry_trolley_cycles
  where id = p_cycle_id
  limit 1;

  if v_cycle.id is null then
    return json_build_object('error', 'Nie znaleziono wózka');
  end if;

  if v_cycle.status = 'canceled' then
    return json_build_object('error', 'To było cofnięte pakowanie. Spakuj ponownie właściwy wózek.');
  end if;

  if v_cycle.returned_at is null then
    return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
  end if;

  select c.client_name
  into v_conflict
  from public.laundry_trolley_cycles c
  where c.id <> v_cycle.id
    and lower(c.trolley_no) = lower(v_cycle.trolley_no)
    and c.returned_at is null
    and coalesce(c.status, '') <> 'canceled'
  limit 1;

  if v_conflict is not null then
    return json_build_object(
      'error',
      format('Nie można cofnąć powrotu: wózek %s jest teraz u %s', v_cycle.trolley_no, v_conflict)
    );
  end if;

  update public.laundry_trolley_cycles
  set status = 'packed',
      returned_by = null,
      returned_at = null,
      updated_at = now()
  where id = p_cycle_id
  returning * into v_cycle;

  perform public.recalculate_laundry_status_for_entries(v_cycle.entry_ids);

  return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
end;
$$;

grant execute on function public.admin_unmark_laundry_washed(text, text[], text) to anon, authenticated;
grant execute on function public.admin_cancel_laundry_trolley(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_undo_return_laundry_trolley(text, uuid, text) to anon, authenticated;
revoke all on function public.recalculate_laundry_status_for_entries(text[]) from public, anon, authenticated;
