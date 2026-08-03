-- Cost performance hours belong to the group of the painted station, not to
-- the employee's home group. Replace the read RPC so every timeline row carries
-- the station group's name used by the frontend aggregation.

create or replace function public.get_costs_month(
  p_session_token text,
  p_month_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_month_key text := trim(coalesce(p_month_key, ''));
  v_year integer;
  v_month integer;
  v_date_from date;
  v_date_to date;
  v_date_from_text text;
  v_date_to_text text;
  v_settings json;
  v_previous_settings json;
  v_costs json;
  v_previous_costs json;
  v_employees json;
  v_schedule json;
  v_timeline json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  if v_month_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month key' using errcode = '22023';
  end if;

  v_date_from := to_date(v_month_key || '-01', 'YYYY-MM-DD');
  v_date_to := (v_date_from + interval '1 month - 1 day')::date;
  v_date_from_text := to_char(v_date_from, 'YYYY-MM-DD');
  v_date_to_text := to_char(v_date_to, 'YYYY-MM-DD');
  v_year := extract(year from v_date_from)::integer;
  v_month := extract(month from v_date_from)::integer;

  select row_to_json(x)
  into v_settings
  from (
    select *
    from public.cost_settings
    where month_key = v_month_key
    limit 1
  ) x;

  select row_to_json(x)
  into v_previous_settings
  from (
    select *
    from public.cost_settings
    where month_key < v_month_key
    order by month_key desc
    limit 1
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_costs
  from (
    select *
    from public.daily_costs
    where entry_date >= v_date_from_text and entry_date <= v_date_to_text
    order by entry_date
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_previous_costs
  from (
    select *
    from public.daily_costs
    where entry_date < v_date_from_text
    order by entry_date desc
    limit 150
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_employees
  from (
    select id, group_name, default_start
    from public.employees
    order by sort_order, name
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_schedule
  from (
    select employee_id, day, value
    from public.schedule_entries
    where year = v_year and month = v_month
    order by employee_id, day
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_timeline
  from (
    select t.entry_date, t.role, t.employee_id, t.hour, g.name as role_group_name
    from public.timeline_entries t
    left join public.roles r on r.code = t.role
    left join public.groups g on g.id = r.group_id
    where t.entry_date >= v_date_from and t.entry_date <= v_date_to
    order by t.entry_date, t.employee_id, t.hour
  ) x;

  return json_build_object(
    'ok', true,
    'settings', v_settings,
    'previous_settings', v_previous_settings,
    'daily_costs', v_costs,
    'previous_daily_costs', v_previous_costs,
    'employees', v_employees,
    'schedule_entries', v_schedule,
    'timeline_entries', v_timeline
  );
end;
$$;

grant execute on function public.get_costs_month(text, text) to anon, authenticated;
