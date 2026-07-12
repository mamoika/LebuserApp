-- Powiązanie kont użytkowników z pracownikami grafiku oraz audytowalne
-- zgłoszenia czasu pracy kierowców. Aplikacja korzysta z własnych tokenów
-- sesji, dlatego tabela pozostaje niedostępna bezpośrednio, a cały dostęp
-- odbywa się przez RPC weryfikujące session_user/require_admin.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.users
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create unique index if not exists users_employee_id_unique
  on public.users (employee_id)
  where employee_id is not null;

create table if not exists public.work_time_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null,
  source_trip_id uuid references public.driver_trips(id) on delete set null,
  reported_start time not null,
  reported_end time not null,
  reported_minutes integer not null check (reported_minutes between 1 and 1440),
  reported_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_start time,
  approved_end time,
  approved_minutes integer check (approved_minutes is null or approved_minutes between 1 and 1440),
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  rejection_note text,
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create table if not exists public.work_time_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.work_time_reports(id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'approved', 'rejected')),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_name text,
  work_start time,
  work_end time,
  work_minutes integer check (work_minutes is null or work_minutes between 1 and 1440),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists work_time_report_events_report_idx
  on public.work_time_report_events (report_id, created_at desc);

create index if not exists work_time_reports_employee_date_idx
  on public.work_time_reports (employee_id, work_date desc);
create index if not exists work_time_reports_status_date_idx
  on public.work_time_reports (status, work_date desc);
create unique index if not exists work_time_reports_employee_date_unique
  on public.work_time_reports (employee_id, work_date);

alter table public.work_time_reports enable row level security;
alter table public.work_time_report_events enable row level security;
revoke all on table public.work_time_reports from public, anon, authenticated;
revoke all on table public.work_time_report_events from public, anon, authenticated;

create or replace function private.work_minutes_between(p_start time, p_end time)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start is null or p_end is null then null
    when p_end >= p_start then round(extract(epoch from (p_end - p_start)) / 60)::integer
    else round(extract(epoch from ((p_end - p_start) + interval '24 hours')) / 60)::integer
  end
$$;

create or replace function private.work_schedule_value(p_start time, p_end time)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_start, 'HH24:MI') || '-' || to_char(p_end, 'HH24:MI')
$$;

create or replace function public.admin_link_user_employee(
  p_session_token text,
  p_user_id uuid,
  p_employee_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_admin(p_session_token);

  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;
  if p_employee_id is not null and not exists (select 1 from public.employees where id = p_employee_id) then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  update public.users set employee_id = p_employee_id where id = p_user_id;
  return json_build_object('ok', true);
exception
  when unique_violation then
    return json_build_object('error', 'Ten pracownik jest już przypisany do innego konta');
end;
$$;

create or replace function public.get_my_work_time(
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
  v_employee json;
  v_reports json;
  v_schedule json;
  v_events json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Invalid month' using errcode = '22023';
  end if;

  select row_to_json(x) into v_employee
  from (
    select e.id, e.name, e.default_start, e.default_end, e.contract_type, e.group_name
    from public.users u
    join public.employees e on e.id = u.employee_id
    where u.id = v_user.id
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.work_date desc), '[]'::json)
  into v_reports
  from (
    select r.*
    from public.work_time_reports r
    where r.user_id = v_user.id
      and extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.day), '[]'::json)
  into v_schedule
  from (
    select s.day, s.value
    from public.schedule_entries s
    join public.users u on u.employee_id = s.employee_id
    where u.id = v_user.id
      and s.year = p_year
      and s.month = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v_events
  from (
    select ev.*
    from public.work_time_report_events ev
    join public.work_time_reports r on r.id = ev.report_id
    where r.user_id = v_user.id
      and extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  return json_build_object(
    'ok', true,
    'employee', v_employee,
    'reports', v_reports,
    'schedule_entries', v_schedule,
    'events', v_events
  );
end;
$$;

create or replace function public.driver_finish_trip_with_time(
  p_session_token text,
  p_trip_id uuid,
  p_end_km numeric,
  p_work_start time,
  p_work_end time
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_report_user_id uuid;
  v_employee_id uuid;
  v_minutes integer;
  v_report public.work_time_reports;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'driver', 'admin_viewer_driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then
    return json_build_object('error', 'To nie Twoja trasa');
  end if;
  if v_trip.status <> 'active' then
    return json_build_object('error', 'Tylko aktywną trasę można zakończyć');
  end if;
  if p_end_km is null then
    return json_build_object('error', 'Brak licznika końcowego');
  end if;

  v_report_user_id := v_trip.driver_id;
  if v_report_user_id is null then
    return json_build_object('error', 'Trasa nie ma przypisanego kierowcy');
  end if;

  select employee_id into v_employee_id from public.users where id = v_report_user_id;
  if v_employee_id is null then
    return json_build_object('error', 'Konto nie jest przypisane do pracownika w grafiku');
  end if;

  v_minutes := private.work_minutes_between(p_work_start, p_work_end);
  if v_minutes is null or v_minutes < 1 or v_minutes > 1440 then
    return json_build_object('error', 'Nieprawidłowy zakres godzin pracy');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_report_user_id::text || ':' || v_trip.trip_date::text, 0));

  if exists (
    select 1 from public.work_time_reports
    where employee_id = v_employee_id and work_date = v_trip.trip_date and status = 'approved'
  ) then
    return json_build_object('error', 'Godziny tego dnia zostały już zatwierdzone');
  end if;

  update public.driver_trips
  set ended_at = now(), end_km = p_end_km, status = 'finished'
  where id = p_trip_id
  returning * into v_trip;

  v_report := null;
  insert into public.work_time_reports (
    user_id, employee_id, work_date, source_trip_id,
    reported_start, reported_end, reported_minutes
  ) values (
    v_report_user_id, v_employee_id, v_trip.trip_date, v_trip.id,
    p_work_start, p_work_end, v_minutes
  )
  on conflict (user_id, work_date) do update set
    employee_id = excluded.employee_id,
    source_trip_id = excluded.source_trip_id,
    reported_start = excluded.reported_start,
    reported_end = excluded.reported_end,
    reported_minutes = excluded.reported_minutes,
    reported_at = now(),
    status = 'pending',
    approved_start = null,
    approved_end = null,
    approved_minutes = null,
    approved_by_user_id = null,
    approved_by_name = null,
    approved_at = null,
    rejection_note = null,
    updated_at = now()
  where public.work_time_reports.status <> 'approved'
  returning * into v_report;

  if v_report.id is null then
    raise exception 'Godziny tego dnia zostały już zatwierdzone' using errcode = 'P0001';
  end if;

  insert into public.work_time_report_events (
    report_id, event_type, actor_user_id, actor_name,
    work_start, work_end, work_minutes
  ) values (
    v_report.id, 'submitted', v_user.id, v_user.name,
    p_work_start, p_work_end, v_minutes
  );

  return json_build_object('ok', true, 'trip', row_to_json(v_trip), 'work_time_report', row_to_json(v_report));
end;
$$;

create or replace function public.admin_approve_work_time(
  p_session_token text,
  p_report_id uuid,
  p_work_start time default null,
  p_work_end time default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_admin_name text;
  v_report public.work_time_reports;
  v_start time;
  v_end time;
  v_minutes integer;
  v_year integer;
  v_month integer;
  v_day integer;
  v_group_name text;
  v_sort_order integer;
begin
  v_admin_id := public.require_admin(p_session_token);
  select name into v_admin_name from public.users where id = v_admin_id;
  select * into v_report from public.work_time_reports where id = p_report_id;
  if v_report.id is null then
    return json_build_object('error', 'Nie znaleziono zgłoszenia godzin');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_report.user_id::text || ':' || v_report.work_date::text, 0));
  select * into v_report from public.work_time_reports where id = p_report_id for update;

  v_start := coalesce(p_work_start, v_report.reported_start);
  v_end := coalesce(p_work_end, v_report.reported_end);
  v_minutes := private.work_minutes_between(v_start, v_end);
  if v_minutes is null or v_minutes < 1 or v_minutes > 1440 then
    return json_build_object('error', 'Nieprawidłowy zakres godzin pracy');
  end if;

  v_year := extract(year from v_report.work_date)::integer;
  v_month := extract(month from v_report.work_date)::integer;
  v_day := extract(day from v_report.work_date)::integer;
  select group_name, coalesce(sort_order, 0) into v_group_name, v_sort_order
  from public.employees where id = v_report.employee_id;

  insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
  values (v_report.employee_id, v_year, v_month, true, v_group_name, v_sort_order)
  on conflict (employee_id, year, month) do update set active = true, updated_at = now();

  insert into public.schedule_entries (employee_id, year, month, day, value, updated_at, updated_by)
  values (
    v_report.employee_id, v_year, v_month, v_day,
    private.work_schedule_value(v_start, v_end), now(), v_admin_name
  )
  on conflict (employee_id, year, month, day) do update set
    value = excluded.value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  update public.work_time_reports set
    status = 'approved',
    approved_start = v_start,
    approved_end = v_end,
    approved_minutes = v_minutes,
    approved_by_user_id = v_admin_id,
    approved_by_name = v_admin_name,
    approved_at = now(),
    rejection_note = null,
    updated_at = now()
  where id = p_report_id
  returning * into v_report;

  insert into public.work_time_report_events (
    report_id, event_type, actor_user_id, actor_name,
    work_start, work_end, work_minutes
  ) values (
    v_report.id, 'approved', v_admin_id, v_admin_name,
    v_start, v_end, v_minutes
  );

  return json_build_object('ok', true, 'report', row_to_json(v_report));
end;
$$;

create or replace function public.admin_reject_work_time(
  p_session_token text,
  p_report_id uuid,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_admin_name text;
  v_report public.work_time_reports;
begin
  v_admin_id := public.require_admin(p_session_token);
  select name into v_admin_name from public.users where id = v_admin_id;
  select * into v_report from public.work_time_reports where id = p_report_id;
  if v_report.id is null then
    return json_build_object('error', 'Nie znaleziono zgłoszenia godzin');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_report.user_id::text || ':' || v_report.work_date::text, 0));
  select * into v_report from public.work_time_reports where id = p_report_id for update;
  if v_report.status = 'approved' then
    return json_build_object('error', 'Zatwierdzone godziny należy skorygować przez ponowne zatwierdzenie');
  end if;

  update public.work_time_reports set
    status = 'rejected',
    rejection_note = nullif(trim(coalesce(p_note, '')), ''),
    approved_start = null,
    approved_end = null,
    approved_minutes = null,
    approved_by_user_id = null,
    approved_by_name = null,
    approved_at = null,
    updated_at = now()
  where id = p_report_id
  returning * into v_report;

  insert into public.work_time_report_events (
    report_id, event_type, actor_user_id, actor_name,
    work_start, work_end, work_minutes, note
  ) values (
    v_report.id, 'rejected', v_admin_id, v_admin_name,
    v_report.reported_start, v_report.reported_end, v_report.reported_minutes,
    v_report.rejection_note
  );

  return json_build_object('ok', true, 'report', row_to_json(v_report));
end;
$$;

create or replace function public.driver_resubmit_work_time(
  p_session_token text,
  p_report_id uuid,
  p_work_start time,
  p_work_end time
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_report public.work_time_reports;
  v_minutes integer;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select * into v_report
  from public.work_time_reports
  where id = p_report_id and user_id = v_user.id;
  if v_report.id is null then
    return json_build_object('error', 'Nie znaleziono Twojego zgłoszenia godzin');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_report.user_id::text || ':' || v_report.work_date::text, 0));
  select * into v_report
  from public.work_time_reports
  where id = p_report_id and user_id = v_user.id
  for update;
  if v_report.status <> 'rejected' then
    return json_build_object('error', 'Poprawić można tylko odrzucone zgłoszenie');
  end if;

  v_minutes := private.work_minutes_between(p_work_start, p_work_end);
  if v_minutes is null or v_minutes < 1 or v_minutes > 1440 then
    return json_build_object('error', 'Nieprawidłowy zakres godzin pracy');
  end if;

  update public.work_time_reports set
    reported_start = p_work_start,
    reported_end = p_work_end,
    reported_minutes = v_minutes,
    reported_at = now(),
    status = 'pending',
    rejection_note = null,
    updated_at = now()
  where id = p_report_id
  returning * into v_report;

  insert into public.work_time_report_events (
    report_id, event_type, actor_user_id, actor_name,
    work_start, work_end, work_minutes
  ) values (
    v_report.id, 'submitted', v_user.id, v_user.name,
    p_work_start, p_work_end, v_minutes
  );

  return json_build_object('ok', true, 'report', row_to_json(v_report));
end;
$$;

create or replace function public.get_admin_users_data(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_users json;
  v_employees json;
  v_driver_cars jsonb := '{}'::jsonb;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_users
  from (
    select
      u.id, u.username, u.name, u.role, u.routes, u.created_at, u.employee_id,
      e.name as employee_name,
      (u.password_hash is not null) as has_password,
      u.privacy_notice_ack_at, u.privacy_notice_ack_version
    from public.users u
    left join public.employees e on e.id = u.employee_id
    order by u.created_at
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_employees
  from (
    select e.id, e.name, e.active, e.group_name
    from public.employees e
    order by e.active desc, e.name
  ) x;

  select coalesce(value, '{}'::jsonb) into v_driver_cars
  from public.app_settings where key = 'driver_cars';

  return json_build_object(
    'ok', true,
    'users', v_users,
    'employees', v_employees,
    'driver_cars', coalesce(v_driver_cars, '{}'::jsonb)
  );
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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_roster
  from (select * from public.get_month_roster(p_year, p_month, false)) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_schedule
  from (
    select * from public.schedule_entries
    where year = p_year and month = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_groups
  from (select * from public.groups order by sort_order, name) x;

  select coalesce(json_agg(row_to_json(x) order by x.work_date desc, x.employee_name), '[]'::json)
  into v_work_time_reports
  from (
    select r.*, e.name as employee_name, u.name as user_name
    from public.work_time_reports r
    join public.employees e on e.id = r.employee_id
    join public.users u on u.id = r.user_id
    where extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  return json_build_object(
    'ok', true,
    'roster', v_roster,
    'schedule_entries', v_schedule,
    'groups', v_groups,
    'work_time_reports', v_work_time_reports
  );
end;
$$;

revoke execute on function public.admin_link_user_employee(text, uuid, uuid) from public;
revoke execute on function public.get_my_work_time(text, integer, integer) from public;
revoke execute on function public.driver_finish_trip_with_time(text, uuid, numeric, time, time) from public;
revoke execute on function public.admin_approve_work_time(text, uuid, time, time) from public;
revoke execute on function public.admin_reject_work_time(text, uuid, text) from public;
revoke execute on function public.driver_resubmit_work_time(text, uuid, time, time) from public;

grant execute on function public.admin_link_user_employee(text, uuid, uuid) to anon, authenticated;
grant execute on function public.get_my_work_time(text, integer, integer) to anon, authenticated;
grant execute on function public.driver_finish_trip_with_time(text, uuid, numeric, time, time) to anon, authenticated;
grant execute on function public.admin_approve_work_time(text, uuid, time, time) to anon, authenticated;
grant execute on function public.admin_reject_work_time(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_resubmit_work_time(text, uuid, time, time) to anon, authenticated;
