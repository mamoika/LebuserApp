-- Oddzielne uprawnienie do edycji grafiku pracy. Nie nadaje dostępu do panelu
-- administratora ani do ustawień grafiku.

alter table public.users
  add column if not exists can_edit_work_schedule boolean not null default false;

comment on column public.users.can_edit_work_schedule is
  'Pozwala edytować grafik miesięczny i obsadę godzinową bez pełnej roli administratora.';

-- Thomas Müller ma login @muller w panelu użytkowników.
update public.users
set can_edit_work_schedule = true
where lower(trim(username)) = 'muller'
  and can_edit_work_schedule is distinct from true;

create or replace function public.get_work_schedule_access(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_can_edit boolean := false;
begin
  -- session_user weryfikuje sesję i ustawia kontekst używany przez audyt.
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select v_user.role = 'admin' or coalesce(u.can_edit_work_schedule, false)
  into v_can_edit
  from public.users u
  where u.id = v_user.id;

  return json_build_object('ok', true, 'can_edit_work_schedule', coalesce(v_can_edit, false));
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
set search_path = public, extensions
as $$
declare
  v_user record;
  v_can_edit boolean := false;
  v_value text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select v_user.role = 'admin' or coalesce(u.can_edit_work_schedule, false)
  into v_can_edit
  from public.users u
  where u.id = v_user.id;

  if not coalesce(v_can_edit, false) then
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
set search_path = public, extensions
as $$
declare
  v_user record;
  v_can_edit boolean := false;
  v_role text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select v_user.role = 'admin' or coalesce(u.can_edit_work_schedule, false)
  into v_can_edit
  from public.users u
  where u.id = v_user.id;

  if not coalesce(v_can_edit, false) then
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

revoke execute on function public.get_work_schedule_access(text) from public;
revoke execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) from public;
revoke execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) from public;

grant execute on function public.get_work_schedule_access(text) to anon, authenticated;
grant execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) to anon, authenticated;
grant execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) to anon, authenticated;

-- Zmiany obu tabel są rejestrowane przez triggery audit_schedule_entries i
-- audit_timeline_entries z migracji zzzzzz_comprehensive_system_audit.sql.
