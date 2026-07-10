begin;

-- Once laundry has been handed to a driver or delivered, packing is part of
-- the delivery history. The driver action must be undone first; otherwise
-- canceling/deleting the packing cycle leaves entries and trolley history out
-- of sync.
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
  v_packed_kg numeric;
  v_trolley_list text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'packer') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.laundry_trolley_cycles
  where id = p_cycle_id;

  if v_cycle.id is null then
    return json_build_object('error', 'Nie znaleziono wózka');
  end if;

  if exists (
    select 1
    from public.entries e
    where e.id = any(v_cycle.entry_ids)
      and e.deleted_at is null
      and (
        e.picked_at is not null
        or e.delivered_at is not null
        or coalesce(e.delivered, false)
        or coalesce(e.done, false)
      )
  ) then
    return json_build_object('error', 'Nie można cofnąć pakowania po wydaniu kierowcy lub dostawie. Najpierw cofnij odbiór/dostawę na trasie.');
  end if;

  if v_cycle.returned_at is not null then
    return json_build_object('error', 'Wózek jest już zwrócony i nie można go cofnąć');
  end if;

  update public.laundry_trolley_cycles
  set returned_at = now(),
      status = 'canceled',
      returned_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      updated_at = now()
  where id = p_cycle_id;

  select coalesce(sum(coalesce(total_kg, 0)), 0)
  into v_packed_kg
  from public.laundry_trolley_cycles
  where returned_at is null
    and client_name = v_cycle.client_name
    and entry_ids && v_cycle.entry_ids;

  select string_agg(distinct trolley_no, ', ' order by trolley_no)
  into v_trolley_list
  from public.laundry_trolley_cycles
  where returned_at is null
    and client_name = v_cycle.client_name
    and entry_ids && v_cycle.entry_ids;

  update public.entries
  set laundry_status = 'washed',
      laundry_packed_at = null,
      laundry_packed_by = null,
      laundry_ready_at = null,
      laundry_trolley_no = v_trolley_list,
      laundry_trolley_cycle_id = null
  where id = any(v_cycle.entry_ids)
    and deleted_at is null;

  return json_build_object('ok', true, 'remaining_kg', v_packed_kg);
end;
$$;

grant execute on function public.admin_cancel_laundry_trolley(text, uuid, text) to anon, authenticated;

create or replace function public.admin_delete_laundry_trolley(
  p_session_token text,
  p_cycle_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_cycle public.laundry_trolley_cycles;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin') then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_cycle from public.laundry_trolley_cycles where id = p_cycle_id;
  if v_cycle.id is null then
    return json_build_object('error', 'Cycle not found');
  end if;

  if exists (
    select 1
    from public.entries e
    where e.id = any(v_cycle.entry_ids)
      and e.deleted_at is null
      and (
        e.picked_at is not null
        or e.delivered_at is not null
        or coalesce(e.delivered, false)
        or coalesce(e.done, false)
      )
  ) then
    return json_build_object('error', 'Nie można usunąć wpisu po wydaniu kierowcy lub dostawie. Najpierw cofnij odbiór/dostawę na trasie.');
  end if;

  update public.entries
  set laundry_trolley_cycle_id = null
  where laundry_trolley_cycle_id = p_cycle_id;

  delete from public.laundry_trolley_cycles where id = p_cycle_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_laundry_trolley(text, uuid) to anon, authenticated;

commit;
