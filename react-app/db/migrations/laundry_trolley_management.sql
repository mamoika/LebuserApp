begin;

-- Delete cycle entirely (for mistakes)
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

  -- Remove references from entries
  update public.entries
  set laundry_trolley_cycle_id = null
  where laundry_trolley_cycle_id = p_cycle_id;

  -- Delete cycle
  delete from public.laundry_trolley_cycles where id = p_cycle_id;

  return json_build_object('ok', true);
end;
$$;

-- Mark trolley as left at client
create or replace function public.admin_set_trolley_at_client(
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
  if v_user.role not in ('admin', 'admin_viewer_driver', 'packer', 'tunnel') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  update public.laundry_trolley_cycles
  set status = 'at_client',
      delivered_at = coalesce(delivered_at, now()),
      delivered_by = coalesce(delivered_by, v_user.name),
      updated_at = now()
  where id = p_cycle_id
  returning * into v_cycle;

  if v_cycle.id is null then
    return json_build_object('error', 'Cycle not found');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_laundry_trolley(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_trolley_at_client(text, uuid) to anon, authenticated;

commit;
