-- Restore the module permission matrix as the only source of truth for
-- work-schedule access. This corrective migration must run after both Thomas
-- Müller work-schedule migrations because the older migration may have been
-- applied later on an existing database and overwritten these RPCs.

begin;

create or replace function public.get_work_schedule_access(p_session_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_can_edit boolean := false;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  v_can_edit := coalesce(
    private.user_module_access(v_user.id, 'work_schedule'),
    0
  ) >= 2;

  return json_build_object(
    'ok', true,
    'can_edit_work_schedule', v_can_edit
  );
end;
$$;

create or replace function public.admin_save_schedule_entry(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_day integer,
  p_value text,
  p_updated_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_value text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12
    or p_day is null or p_day < 1 or p_day > 31
  then
    return json_build_object('error', 'Nieprawidłowa data grafiku');
  end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if v_value is null then
    return json_build_object('error', 'Brak wartości grafiku');
  end if;

  insert into public.schedule_entries (
    employee_id, year, month, day, value, updated_at, updated_by
  ) values (
    p_employee_id, p_year, p_month, p_day, upper(v_value), now(), v_user.name
  )
  on conflict (employee_id, year, month, day)
  do update set
    value = excluded.value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_timeline_entry(
  p_session_token text,
  p_employee_id uuid,
  p_entry_date date,
  p_hour integer,
  p_role text,
  p_updated_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_role text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_entry_date is null or p_hour is null or p_hour < 0 or p_hour > 23 then
    return json_build_object('error', 'Nieprawidłowy termin osi czasu');
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');

  if v_role is null then
    delete from public.timeline_entries
    where employee_id = p_employee_id
      and entry_date = p_entry_date
      and hour = p_hour;
  else
    insert into public.timeline_entries (
      employee_id, entry_date, hour, role, updated_at, updated_by
    ) values (
      p_employee_id, p_entry_date, p_hour, v_role, now(), v_user.name
    )
    on conflict (employee_id, entry_date, hour)
    do update set
      role = excluded.role,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.get_work_schedule_access(text) from public, anon, authenticated;
revoke all on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) from public, anon, authenticated;

grant execute on function public.get_work_schedule_access(text) to anon, authenticated;
grant execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) to anon, authenticated;
grant execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) to anon, authenticated;

commit;
