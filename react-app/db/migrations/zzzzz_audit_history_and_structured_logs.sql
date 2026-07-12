-- Widoczna historia weryfikacji czasu pracy oraz strukturalny dziennik aktywności.

alter table public.logs
  add column if not exists actor_user_id uuid references public.users(id) on delete set null,
  add column if not exists actor_role text,
  add column if not exists category text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists session_id uuid references public.user_sessions(id) on delete set null,
  add column if not exists device_label text;

create index if not exists logs_actor_created_idx on public.logs (actor_user_id, created_at desc);
create index if not exists logs_category_created_idx on public.logs (category, created_at desc);
create index if not exists logs_entity_idx on public.logs (entity_type, entity_id, created_at desc);
create index if not exists logs_session_id_idx on public.logs (session_id) where session_id is not null;
create index if not exists work_time_report_events_actor_user_idx
  on public.work_time_report_events (actor_user_id) where actor_user_id is not null;

drop policy if exists "logs access" on public.logs;
drop policy if exists "Dostęp dla zalogowanych do logów" on public.logs;
drop policy if exists "Anyone inserts logs" on public.logs;
drop policy if exists "Admin reads logs" on public.logs;
revoke all on table public.logs from anon, authenticated;

drop function if exists public.insert_log(text, text, text, text, text);
create or replace function public.insert_log(
  p_session_token text,
  p_action text,
  p_client_name text default null,
  p_entry_id text default null,
  p_details text default null,
  p_category text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
  v_category text;
  v_entity_type text;
  v_entity_id text;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if nullif(trim(coalesce(p_action, '')), '') is null then
    return json_build_object('error', 'Brak akcji logu');
  end if;

  select s.id, s.device_label into v_session
  from public.user_sessions s
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null and s.expires_at > now()
  limit 1;

  v_category := coalesce(
    nullif(trim(coalesce(p_category, '')), ''),
    case
      when p_action like 'trip_%' then 'routes'
      when p_entry_id is not null then 'entries'
      else 'general'
    end
  );
  v_entity_type := coalesce(
    nullif(trim(coalesce(p_entity_type, '')), ''),
    case
      when p_entry_id is not null then 'entry'
      when p_action like 'trip_%' then 'trip'
      when p_client_name is not null then 'client'
      else 'activity'
    end
  );
  v_entity_id := coalesce(nullif(trim(coalesce(p_entity_id, '')), ''), nullif(trim(coalesce(p_entry_id, '')), ''));

  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category,
    client_name, entry_id, entity_type, entity_id,
    details, metadata, session_id, device_label, created_at
  ) values (
    v_user.name, v_user.id, v_user.role, trim(p_action), v_category,
    nullif(trim(coalesce(p_client_name, '')), ''), nullif(trim(coalesce(p_entry_id, '')), ''),
    v_entity_type, v_entity_id,
    nullif(trim(coalesce(p_details, '')), ''), coalesce(p_metadata, '{}'::jsonb),
    v_session.id, v_session.device_label, now()
  );
  return json_build_object('ok', true);
end;
$$;

create or replace function public.get_logs_page(
  p_session_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows json;
begin
  perform public.require_admin(p_session_token);
  select count(*) into v_total from public.logs;
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
  from (
    select id, user_name, actor_user_id, actor_role, action, category,
      client_name, entry_id, entity_type, entity_id, details, metadata,
      session_id, device_label, created_at
    from public.logs order by created_at desc limit v_limit offset v_offset
  ) x;
  return json_build_object('ok', true, 'total', v_total, 'logs', v_rows);
end;
$$;

create or replace function public.get_entry_logs(p_session_token text, p_entry_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_entry record;
  v_route_ids integer[];
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if nullif(trim(coalesce(p_entry_id, '')), '') is null then return json_build_object('error', 'Brak id wpisu'); end if;
  select id, route_id into v_entry from public.entries where id = p_entry_id limit 1;
  if v_entry.id is null then return json_build_object('error', 'Nie znaleziono wpisu'); end if;
  if v_user.role not in ('admin', 'admin_viewer') then
    v_route_ids := array(
      select nullif(trim(x), '')::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where nullif(trim(x), '') is not null
    );
    if v_entry.route_id is null or not (v_entry.route_id = any(v_route_ids)) then
      raise exception 'Entry access denied' using errcode = '42501';
    end if;
  end if;
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
  from (
    select id, user_name, actor_user_id, actor_role, action, category,
      client_name, entry_id, entity_type, entity_id, details, metadata,
      session_id, device_label, created_at
    from public.logs where entry_id = p_entry_id order by created_at asc
  ) x;
  return json_build_object('ok', true, 'logs', v_rows);
end;
$$;

create or replace function private.log_work_time_event()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_report public.work_time_reports;
  v_employee_name text;
  v_actor_role text;
begin
  select * into v_report from public.work_time_reports where id = new.report_id;
  select name into v_employee_name from public.employees where id = v_report.employee_id;
  select role into v_actor_role from public.users where id = new.actor_user_id;
  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category, client_name,
    entity_type, entity_id, details, metadata, created_at
  ) values (
    coalesce(new.actor_name, 'Usunięty użytkownik'), new.actor_user_id, v_actor_role,
    'work_time_' || new.event_type, 'work_time', v_employee_name,
    'work_time_report', new.report_id::text,
    case new.event_type
      when 'submitted' then 'Zgłoszono czas pracy'
      when 'approved' then 'Zatwierdzono czas pracy'
      when 'rejected' then 'Odrzucono czas pracy'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'work_date', v_report.work_date,
      'employee_id', v_report.employee_id,
      'work_start', to_char(new.work_start, 'HH24:MI'),
      'work_end', to_char(new.work_end, 'HH24:MI'),
      'work_minutes', new.work_minutes,
      'note', new.note
    )),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists work_time_event_activity_log on public.work_time_report_events;
create trigger work_time_event_activity_log
after insert on public.work_time_report_events
for each row execute function private.log_work_time_event();

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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_roster
  from (select * from public.get_month_roster(p_year, p_month, false)) x;
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_schedule
  from (select * from public.schedule_entries where year = p_year and month = p_month) x;
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
    'work_time_events', v_work_time_events
  );
end;
$$;

revoke execute on function public.insert_log(text, text, text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.get_logs_page(text, integer, integer) from public;
revoke execute on function public.get_entry_logs(text, text) from public;
revoke execute on function private.log_work_time_event() from public, anon, authenticated;
grant execute on function public.insert_log(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_logs_page(text, integer, integer) to anon, authenticated;
grant execute on function public.get_entry_logs(text, text) to anon, authenticated;
