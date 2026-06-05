create or replace function public.admin_create_group(
  p_session_token text,
  p_name text,
  p_color text default '#455a64',
  p_sort_order integer default 9999
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Nazwa grupy jest wymagana');
  end if;

  insert into public.groups(name, color, sort_order)
  values (trim(p_name), coalesce(nullif(trim(p_color), ''), '#455a64'), coalesce(p_sort_order, 9999))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return json_build_object('error', 'Grupa o tej nazwie już istnieje');
end;
$$;

create or replace function public.admin_update_group(
  p_session_token text,
  p_group_id uuid,
  p_name text,
  p_color text default '#455a64',
  p_sort_order integer default 9999
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
  v_new_name text;
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Nazwa grupy jest wymagana');
  end if;
  v_new_name := trim(p_name);

  select name into v_old_name from public.groups where id = p_group_id;
  if v_old_name is null then
    return json_build_object('error', 'Nie znaleziono grupy');
  end if;

  update public.groups
  set name = v_new_name,
      color = coalesce(nullif(trim(p_color), ''), '#455a64'),
      sort_order = coalesce(p_sort_order, 9999)
  where id = p_group_id;

  if v_new_name <> v_old_name then
    update public.employees
    set group_name = v_new_name
    where group_name = v_old_name;

    update public.employee_months
    set group_name = v_new_name
    where group_name = v_old_name;
  end if;

  return json_build_object('ok', true);
exception
  when unique_violation then
    return json_build_object('error', 'Grupa o tej nazwie już istnieje');
end;
$$;

create or replace function public.admin_delete_group(
  p_session_token text,
  p_group_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform public.require_admin(p_session_token);

  select name into v_name from public.groups where id = p_group_id;
  if v_name is null then
    return json_build_object('error', 'Nie znaleziono grupy');
  end if;

  if exists (select 1 from public.employees where group_name = v_name) then
    return json_build_object('error', 'Nie można usunąć grupy, do której przypisani są pracownicy.');
  end if;

  delete from public.groups where id = p_group_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_create_group(text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_update_group(text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.admin_delete_group(text, uuid) to anon, authenticated;

revoke insert, update, delete on table public.groups from anon, authenticated;
