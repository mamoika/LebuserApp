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
set search_path = public
as $$
declare
  v_value text;
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 or p_day is null or p_day < 1 or p_day > 31 then
    return json_build_object('error', 'Nieprawidłowa data grafiku');
  end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if v_value is null then
    return json_build_object('error', 'Brak wartości grafiku');
  end if;

  insert into public.schedule_entries (employee_id, year, month, day, value, updated_at, updated_by)
  values (p_employee_id, p_year, p_month, p_day, upper(v_value), now(), nullif(trim(coalesce(p_updated_by, '')), ''))
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
set search_path = public
as $$
declare
  v_role text;
begin
  perform public.require_admin(p_session_token);

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
    insert into public.timeline_entries (employee_id, entry_date, hour, role, updated_at, updated_by)
    values (p_employee_id, p_entry_date, p_hour, v_role, now(), nullif(trim(coalesce(p_updated_by, '')), ''))
    on conflict (employee_id, entry_date, hour)
    do update set
      role = excluded.role,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) to anon, authenticated;
grant execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) to anon, authenticated;

revoke insert, update, delete on table public.schedule_entries from anon, authenticated;
revoke insert, update, delete on table public.timeline_entries from anon, authenticated;
