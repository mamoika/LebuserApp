begin;

alter table public.employees
  add column if not exists employment_started_on date,
  add column if not exists employment_last_working_on date;

comment on column public.employees.employment_started_on is
  'Start bieżącego lub ostatniego okresu zatrudnienia.';
comment on column public.employees.employment_last_working_on is
  'Ostatni dzień pracy; null oznacza, że pracownik obecnie pracuje.';
comment on column public.employees.employment_ended_on is
  'Pierwszy dzień poza zatrudnieniem, używany do wykluczania kolejnych miesięcy.';

create table if not exists public.employee_employment_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_employment_periods_dates_check
    check (ended_on is null or ended_on >= started_on),
  constraint employee_employment_periods_employee_start_unique
    unique (employee_id, started_on)
);

comment on table public.employee_employment_periods is
  'Okresy zatrudnienia pracownika; zakończone okresy pozostają jako historia po ponownym zatrudnieniu.';

create index if not exists employee_employment_periods_employee_dates_idx
  on public.employee_employment_periods (employee_id, started_on, ended_on);

alter table public.employee_employment_periods enable row level security;
revoke all on table public.employee_employment_periods from public, anon, authenticated;

with inferred as (
  select
    e.id as employee_id,
    coalesce(
      e.employment_started_on,
      (
        select min(make_date(em.year, em.month, 1))
        from public.employee_months em
        where em.employee_id = e.id
          and em.active = true
      ),
      case when e.employment_ended_on is not null then e.employment_ended_on - 1 else current_date end
    ) as started_on,
    case
      when e.employment_ended_on is not null then e.employment_ended_on - 1
      else null
    end as ended_on
  from public.employees e
)
insert into public.employee_employment_periods (employee_id, started_on, ended_on)
select employee_id, least(started_on, coalesce(ended_on, started_on)), ended_on
from inferred
on conflict (employee_id, started_on) do nothing;

update public.employees e
set employment_started_on = (
      select p.started_on
      from public.employee_employment_periods p
      where p.employee_id = e.id
      order by p.started_on desc
      limit 1
    ),
    employment_last_working_on = (
      select p.ended_on
      from public.employee_employment_periods p
      where p.employee_id = e.id
      order by p.started_on desc
      limit 1
    )
where exists (
  select 1 from public.employee_employment_periods p where p.employee_id = e.id
);

create or replace function public.admin_save_employee_employment_profile(
  p_session_token text,
  p_employee_id uuid,
  p_started_on date,
  p_currently_employed boolean,
  p_last_working_on date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_end date;
  v_current boolean := coalesce(p_currently_employed, true);
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_started_on is null then
    return json_build_object('error', 'Data rozpoczęcia pracy jest wymagana');
  end if;
  if not v_current and p_last_working_on is null then
    return json_build_object('error', 'Data zakończenia pracy jest wymagana');
  end if;
  if p_last_working_on is not null and p_last_working_on < p_started_on then
    return json_build_object('error', 'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia');
  end if;
  if not v_current and p_last_working_on > current_date then
    return json_build_object('error', 'Data zakończenia nie może być z przyszłości, jeśli pracownik już nie pracuje');
  end if;

  select employment_last_working_on
  into v_previous_end
  from public.employees
  where id = p_employee_id
  for update;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  if v_current then
    if v_previous_end is not null then
      insert into public.employee_employment_periods (employee_id, started_on, ended_on)
      values (p_employee_id, p_started_on, null)
      on conflict (employee_id, started_on) do update set
        ended_on = null,
        updated_at = now();

      insert into public.employee_employment_events (employee_id, event_type, effective_on)
      values (p_employee_id, 'employment_restarted', p_started_on)
      on conflict (employee_id, event_type, effective_on) do nothing;
    else
      update public.employee_employment_periods
      set started_on = p_started_on,
          updated_at = now()
      where id = (
        select p.id
        from public.employee_employment_periods p
        where p.employee_id = p_employee_id
          and p.ended_on is null
        order by p.started_on desc
        limit 1
      );

      if not found then
        insert into public.employee_employment_periods (employee_id, started_on, ended_on)
        values (p_employee_id, p_started_on, null)
        on conflict (employee_id, started_on) do update set ended_on = null, updated_at = now();
      end if;
    end if;
  else
    update public.employee_employment_periods
    set started_on = p_started_on,
        ended_on = p_last_working_on,
        updated_at = now()
    where id = (
      select p.id
      from public.employee_employment_periods p
      where p.employee_id = p_employee_id
        and p.ended_on is null
      order by p.started_on desc
      limit 1
    );

    if not found then
      insert into public.employee_employment_periods (employee_id, started_on, ended_on)
      values (p_employee_id, p_started_on, p_last_working_on)
      on conflict (employee_id, started_on) do update set
        ended_on = excluded.ended_on,
        updated_at = now();
    end if;

    insert into public.employee_employment_events (employee_id, event_type, effective_on)
    values (p_employee_id, 'employment_ended', p_last_working_on + 1)
    on conflict (employee_id, event_type, effective_on) do nothing;
  end if;

  update public.employees
  set active = v_current,
      employment_started_on = p_started_on,
      employment_last_working_on = case when v_current then null else p_last_working_on end,
      employment_ended_on = case when v_current then null else p_last_working_on + 1 end
  where id = p_employee_id;

  if not v_current then
    update public.employee_months
    set active = false,
        updated_at = now()
    where employee_id = p_employee_id
      and make_date(year, month, 1) > p_last_working_on;
  end if;

  return json_build_object(
    'ok', true,
    'employment_started_on', p_started_on,
    'employment_last_working_on', case when v_current then null else p_last_working_on end
  );
end;
$$;

create or replace function public.admin_end_employee_from_month(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end_date date;
  v_last_working_on date;
  v_started_on date;
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then return json_build_object('error', 'Brak pracownika'); end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  v_end_date := make_date(p_year, p_month, 1);
  v_last_working_on := v_end_date - 1;

  select coalesce(employment_started_on, v_last_working_on)
  into v_started_on
  from public.employees
  where id = p_employee_id;

  if not found then return json_build_object('error', 'Nie znaleziono pracownika'); end if;

  update public.employees
  set active = false,
      employment_last_working_on = v_last_working_on,
      employment_ended_on = v_end_date
  where id = p_employee_id;

  update public.employee_employment_periods
  set ended_on = greatest(started_on, v_last_working_on),
      updated_at = now()
  where id = (
    select p.id from public.employee_employment_periods p
    where p.employee_id = p_employee_id and p.ended_on is null
    order by p.started_on desc limit 1
  );

  insert into public.employee_employment_events (employee_id, event_type, effective_on)
  values (p_employee_id, 'employment_ended', v_end_date)
  on conflict (employee_id, event_type, effective_on) do nothing;

  update public.employee_months
  set active = false, updated_at = now()
  where employee_id = p_employee_id
    and (year > p_year or (year = p_year and month >= p_month));

  return json_build_object('ok', true, 'employment_ended_on', v_end_date);
end;
$$;

create or replace function public.admin_rehire_employee_from_month(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_group_name text,
  p_default_start text default '7',
  p_default_end text default '15',
  p_sort_order integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restart_date date;
begin
  perform public.require_admin(p_session_token);
  if p_employee_id is null then return json_build_object('error', 'Brak pracownika'); end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  v_restart_date := make_date(p_year, p_month, 1);

  update public.employees
  set active = true,
      employment_started_on = v_restart_date,
      employment_last_working_on = null,
      employment_ended_on = null
  where id = p_employee_id;
  if not found then return json_build_object('error', 'Nie znaleziono pracownika'); end if;

  insert into public.employee_employment_periods (employee_id, started_on, ended_on)
  values (p_employee_id, v_restart_date, null)
  on conflict (employee_id, started_on) do update set ended_on = null, updated_at = now();

  insert into public.employee_employment_events (employee_id, event_type, effective_on)
  values (p_employee_id, 'employment_restarted', v_restart_date)
  on conflict (employee_id, event_type, effective_on) do nothing;

  insert into public.employee_months (
    employee_id, year, month, active, group_name, sort_order, default_start, default_end
  ) values (
    p_employee_id, p_year, p_month, true,
    nullif(trim(coalesce(p_group_name, '')), ''), coalesce(p_sort_order, 0),
    coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7'),
    coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15')
  )
  on conflict (employee_id, year, month) do update set
    active = true, group_name = excluded.group_name, sort_order = excluded.sort_order,
    default_start = excluded.default_start, default_end = excluded.default_end, updated_at = now();

  insert into public.employee_month_roster_state (year, month, is_manual)
  values (p_year, p_month, true)
  on conflict (year, month) do update set is_manual = true;

  return json_build_object('ok', true, 'employment_restarted_on', v_restart_date);
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
  v_entry_date date;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;
  if p_employee_id is null then return json_build_object('error', 'Brak pracownika'); end if;

  begin
    v_entry_date := make_date(p_year, p_month, p_day);
  exception when others then
    return json_build_object('error', 'Nieprawidłowa data grafiku');
  end;

  if not exists (
    select 1 from public.employee_employment_periods p
    where p.employee_id = p_employee_id
      and p.started_on <= v_entry_date
      and (p.ended_on is null or p.ended_on >= v_entry_date)
  ) then
    return json_build_object('error', 'Nie można wpisać obecności poza okresem zatrudnienia');
  end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if v_value is null then return json_build_object('error', 'Brak wartości grafiku'); end if;

  insert into public.schedule_entries (employee_id, year, month, day, value, updated_at, updated_by)
  values (p_employee_id, p_year, p_month, p_day, upper(v_value), now(), v_user.name)
  on conflict (employee_id, year, month, day) do update set
    value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

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
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;
  if p_employee_id is null then return json_build_object('error', 'Brak pracownika'); end if;
  if p_entry_date is null or p_hour is null or p_hour < 0 or p_hour > 23 then
    return json_build_object('error', 'Nieprawidłowa data lub godzina');
  end if;
  if not exists (
    select 1 from public.employee_employment_periods p
    where p.employee_id = p_employee_id
      and p.started_on <= p_entry_date
      and (p.ended_on is null or p.ended_on >= p_entry_date)
  ) then
    return json_build_object('error', 'Nie można wpisać pracy poza okresem zatrudnienia');
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');
  if v_role is null then
    delete from public.timeline_entries
    where employee_id = p_employee_id and entry_date = p_entry_date and hour = p_hour;
  else
    insert into public.timeline_entries (employee_id, entry_date, hour, role, updated_at, updated_by)
    values (p_employee_id, p_entry_date, p_hour, v_role, now(), v_user.name)
    on conflict (employee_id, entry_date, hour) do update set
      role = excluded.role, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.get_work_schedule_month(
  p_session_token text,
  p_year integer,
  p_month integer
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_roster json;
  v_schedule json;
  v_groups json;
  v_work_time_reports json;
  v_work_time_events json;
  v_employment_periods json;
  v_month_start date := make_date(p_year, p_month, 1);
  v_month_end date := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_roster
  from (select * from public.get_month_roster(p_year, p_month, false)) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_employment_periods
  from (
    select p.id, p.employee_id, p.started_on, p.ended_on
    from public.employee_employment_periods p
    where p.started_on <= v_month_end
      and (p.ended_on is null or p.ended_on >= v_month_start)
    order by p.employee_id, p.started_on
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_schedule
  from (
    select s.*
    from public.schedule_entries s
    where s.year = p_year and s.month = p_month
      and exists (
        select 1 from public.employee_employment_periods p
        where p.employee_id = s.employee_id
          and p.started_on <= make_date(s.year, s.month, s.day)
          and (p.ended_on is null or p.ended_on >= make_date(s.year, s.month, s.day))
      )
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_groups
  from (select * from public.groups order by sort_order, name) x;

  select coalesce(json_agg(row_to_json(x) order by x.work_date desc, x.employee_name), '[]'::json)
  into v_work_time_reports
  from (
    select r.*, e.name as employee_name, coalesce(u.name, r.user_name) as user_name
    from public.work_time_reports r
    join public.employees e on e.id = r.employee_id
    left join public.users u on u.id = r.user_id
    where extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v_work_time_events
  from (
    select ev.*, r.work_date, r.employee_id, e.name as employee_name,
      coalesce(u.name, r.user_name) as user_name
    from public.work_time_report_events ev
    join public.work_time_reports r on r.id = ev.report_id
    join public.employees e on e.id = r.employee_id
    left join public.users u on u.id = r.user_id
    where extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  return json_build_object(
    'ok', true, 'roster', v_roster, 'schedule_entries', v_schedule,
    'groups', v_groups, 'work_time_reports', v_work_time_reports,
    'work_time_events', v_work_time_events, 'employment_periods', v_employment_periods
  );
end;
$$;

revoke all on function public.admin_save_employee_employment_profile(text, uuid, date, boolean, date) from public, anon, authenticated;
grant execute on function public.admin_save_employee_employment_profile(text, uuid, date, boolean, date) to anon, authenticated;

revoke all on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_save_schedule_entry(text, uuid, integer, integer, integer, text, text) to anon, authenticated;

revoke all on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_save_timeline_entry(text, uuid, date, integer, text, text) to anon, authenticated;

revoke all on function public.get_work_schedule_month(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_work_schedule_month(text, integer, integer) to anon, authenticated;

commit;
