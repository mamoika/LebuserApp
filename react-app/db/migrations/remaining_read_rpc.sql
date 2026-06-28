-- ============================================================
--  Remaining browser reads through session-token RPCs.
--
--  Non-breaking phase: add protected read endpoints used by the frontend.
--  Run this before deploying the matching frontend. Revoke SELECT grants only
--  after the deployed app passes the smoke test.
-- ============================================================

create or replace function public.lebuser_text_jsonb_array(p_value text)
returns text[]
language plpgsql
set search_path = public, extensions
as $$
declare
  v_json jsonb;
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then
    return array[]::text[];
  end if;

  begin
    v_json := p_value::jsonb;
  exception
    when others then
      return array[]::text[];
  end;

  if jsonb_typeof(v_json) <> 'array' then
    return array[]::text[];
  end if;

  return array(
    select value
    from jsonb_array_elements_text(v_json) as value
    where nullif(trim(value), '') is not null
  );
end;
$$;

revoke execute on function public.lebuser_text_jsonb_array(text) from public, anon, authenticated;

create or replace function public.get_app_data(
  p_session_token text,
  p_last_week_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_last_week_key text := coalesce(
    nullif(trim(coalesce(p_last_week_key, '')), ''),
    to_char((date_trunc('week', now())::date - 7), 'YYYY-MM-DD')
  );
  v_route_ids integer[] := array[]::integer[];
  v_trip_route_ids integer[] := array[]::integer[];
  v_extra_client_names text[] := array[]::text[];
  v_visible_route_ids integer[] := array[]::integer[];
  v_visible_client_names text[] := array[]::text[];
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role = 'driver' then
    v_route_ids := array(
      select distinct trim(x)::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where trim(x) ~ '^[0-9]+$'
    );

    v_trip_route_ids := array(
      select distinct trim(x)::integer
      from public.driver_trips dt
      cross join lateral regexp_split_to_table(coalesce(dt.routes, ''), ',') as x
      where (dt.driver_id = v_user.id or dt.status = 'handover')
        and dt.status in ('planned', 'active', 'handover')
        and trim(x) ~ '^[0-9]+$'
    );

    v_extra_client_names := array(
      select distinct trim(x)
      from public.driver_trips dt
      cross join lateral unnest(public.lebuser_text_jsonb_array(dt.extra_clients)) as x
      where (dt.driver_id = v_user.id or dt.status = 'handover')
        and dt.status in ('planned', 'active', 'handover')
        and nullif(trim(x), '') is not null
    );

    v_visible_route_ids := array(
      select distinct route_id
      from (
        select unnest(v_route_ids) as route_id
        union
        select unnest(v_trip_route_ids) as route_id
        union
        select c.route_id
        from public.clients c
        where c.name = any(v_extra_client_names)
      ) s
      where route_id is not null
    );

    v_visible_client_names := array(
      select distinct c.name
      from public.clients c
      where c.route_id = any(v_visible_route_ids)
         or c.name = any(v_extra_client_names)
    );

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_clients
    from (
      select *
      from public.clients
      where name = any(v_visible_client_names)
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_routes
    from (
      select *
      from public.routes
      where id = any(v_visible_route_ids)
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_entries
    from (
      select *
      from public.entries
      where deleted_at is null
        and (
          done = false
          or week_key >= v_last_week_key
          or pick_week_key >= v_last_week_key
        )
        and (
          route_id = any(v_visible_route_ids)
          or client_name = any(v_visible_client_names)
          or picked_by = v_user.name
          or delivered_by = v_user.name
          or added_by = v_user.name
        )
    ) x;

    if to_regclass('public.laundry_receipts') is not null then
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      into v_receipts
      from (
        select *
        from public.laundry_receipts
        where deleted_at is null
          and client_name = any(v_visible_client_names)
        order by doc_no desc
      ) x;
    end if;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_clients
    from (
      select *
      from public.clients
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_routes
    from (
      select *
      from public.routes
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_entries
    from (
      select *
      from public.entries
      where deleted_at is null
        and (
          done = false
          or week_key >= v_last_week_key
          or pick_week_key >= v_last_week_key
        )
    ) x;

    if to_regclass('public.laundry_receipts') is not null then
      execute
        'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
         from (
           select *
           from public.laundry_receipts
           where deleted_at is null
           order by doc_no desc
         ) x'
      into v_receipts;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'clients', v_clients,
    'routes', v_routes,
    'entries', v_entries,
    'receipts', v_receipts
  );
end;
$$;

grant execute on function public.get_app_data(text, text) to anon, authenticated;

create or replace function public.get_month_roster_secure(
  p_session_token text,
  p_year integer,
  p_month integer,
  p_include_inactive boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if coalesce(p_include_inactive, false) and v_user.role <> 'admin' then
    raise exception 'Admin session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select *
    from public.get_month_roster(p_year, p_month, coalesce(p_include_inactive, false))
  ) x;

  return json_build_object('ok', true, 'roster', v_rows);
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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roster
  from (
    select *
    from public.get_month_roster(p_year, p_month, false)
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_schedule
  from (
    select *
    from public.schedule_entries
    where year = p_year and month = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_groups
  from (
    select *
    from public.groups
    order by sort_order, name
  ) x;

  return json_build_object(
    'ok', true,
    'roster', v_roster,
    'schedule_entries', v_schedule,
    'groups', v_groups
  );
end;
$$;

create or replace function public.get_timeline_week(
  p_session_token text,
  p_date_from date,
  p_date_to date,
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
  v_timeline json;
  v_schedule json;
  v_groups json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roster
  from (
    select *
    from public.get_month_roster(p_year, p_month, false)
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_timeline
  from (
    select *
    from public.timeline_entries
    where entry_date >= p_date_from and entry_date <= p_date_to
    order by entry_date, employee_id, hour
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_schedule
  from (
    select employee_id, day, value
    from public.schedule_entries
    where year = p_year and month = p_month
    order by employee_id, day
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_groups
  from (
    select *
    from public.groups
    order by sort_order, name
  ) x;

  return json_build_object(
    'ok', true,
    'roster', v_roster,
    'timeline_entries', v_timeline,
    'schedule_entries', v_schedule,
    'groups', v_groups
  );
end;
$$;

create or replace function public.get_schedule_driver_trips(
  p_session_token text,
  p_limit integer default 120
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_limit integer := least(greatest(coalesce(p_limit, 120), 1), 300);
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role = 'driver' then
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_rows
    from (
      select *
      from public.driver_trips
      where driver_id = v_user.id
      order by started_at desc
      limit v_limit
    ) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_rows
    from (
      select *
      from public.driver_trips
      order by started_at desc
      limit v_limit
    ) x;
  end if;

  return json_build_object('ok', true, 'trips', v_rows);
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
  v_driver_cars jsonb := '{}'::jsonb;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_users
  from (
    select
      u.id,
      u.username,
      u.name,
      u.role,
      u.routes,
      u.created_at,
      (u.password_hash is not null) as has_password,
      u.privacy_notice_ack_at,
      u.privacy_notice_ack_version
    from public.users u
    order by u.created_at
  ) x;

  select coalesce(value, '{}'::jsonb)
  into v_driver_cars
  from public.app_settings
  where key = 'driver_cars';

  return json_build_object(
    'ok', true,
    'users', v_users,
    'driver_cars', coalesce(v_driver_cars, '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_route_options(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_routes json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_routes
  from (
    select id, name
    from public.routes
    order by sort_order, name
  ) x;

  return json_build_object('ok', true, 'routes', v_routes);
end;
$$;

create or replace function public.get_admin_groups(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_groups json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_groups
  from (
    select *
    from public.groups
    order by sort_order, name
  ) x;

  return json_build_object('ok', true, 'groups', v_groups);
end;
$$;

create or replace function public.get_admin_group_employee_count(
  p_session_token text,
  p_group_name text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  perform public.require_admin(p_session_token);

  select count(*)
  into v_count
  from public.employees
  where group_name = p_group_name;

  return json_build_object('ok', true, 'count', coalesce(v_count, 0));
end;
$$;

create or replace function public.get_admin_employees_data(
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
  v_employees json;
  v_groups json;
  v_roster json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_employees
  from (
    select *
    from public.employees
    order by sort_order, name
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_groups
  from (
    select *
    from public.groups
    order by sort_order, name
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roster
  from (
    select *
    from public.get_month_roster(p_year, p_month, true)
  ) x;

  return json_build_object(
    'ok', true,
    'employees', v_employees,
    'groups', v_groups,
    'roster', v_roster
  );
end;
$$;

create or replace function public.get_client_usage_status(
  p_session_token text,
  p_client_name text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_used boolean;
begin
  perform public.require_admin(p_session_token);

  select exists (
    select 1
    from public.entries
    where client_name = p_client_name
    limit 1
  )
  into v_used;

  return json_build_object('ok', true, 'used', coalesce(v_used, false));
end;
$$;

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
    select entry_date, role, employee_id, hour
    from public.timeline_entries
    where entry_date >= v_date_from and entry_date <= v_date_to
    order by entry_date, employee_id, hour
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

create or replace function public.get_costs_history(
  p_session_token text,
  p_year integer,
  p_current_month_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_current_month_key text := trim(coalesce(p_current_month_key, ''));
  v_window_from date;
  v_current_start date;
  v_window_from_text text;
  v_current_start_text text;
  v_costs json;
  v_settings json;
  v_schedule json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  if p_year is null or v_current_month_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid history range' using errcode = '22023';
  end if;

  v_window_from := make_date(p_year - 1, 12, 1);
  v_current_start := to_date(v_current_month_key || '-01', 'YYYY-MM-DD');
  v_window_from_text := to_char(v_window_from, 'YYYY-MM-DD');
  v_current_start_text := to_char(v_current_start, 'YYYY-MM-DD');

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_costs
  from (
    select
      entry_date,
      fiat_end,
      isuzu_end,
      merc_end,
      iveco_end,
      elec_end,
      gas_prod_end,
      gas_heat_end,
      water_end,
      other_costs,
      ton_zd1,
      ton_zd2,
      ton_pralki
    from public.daily_costs
    where entry_date >= v_window_from_text and entry_date < v_current_start_text
    order by entry_date
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_settings
  from (
    select *
    from public.cost_settings
    order by month_key
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_schedule
  from (
    select year, month, value
    from public.schedule_entries
    where year = p_year
    order by month, employee_id, day
  ) x;

  return json_build_object(
    'ok', true,
    'daily_costs', v_costs,
    'settings', v_settings,
    'schedule_entries', v_schedule
  );
end;
$$;

create or replace function public.get_performance_progi(
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
  v_key text;
  v_value jsonb;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  if trim(coalesce(p_month_key, '')) !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month key' using errcode = '22023';
  end if;

  v_key := 'performance_progi_' || trim(p_month_key);

  select value
  into v_value
  from public.app_settings
  where key = v_key;

  if v_value is null then
    select value
    into v_value
    from public.app_settings
    where key like 'performance_progi_%'
      and key < v_key
    order by key desc
    limit 1;
  end if;

  return json_build_object('ok', true, 'progi', v_value);
end;
$$;

create or replace function public.get_driver_trips_data(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trips json;
  v_costs json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver') then
    raise exception 'Driver data access required' using errcode = '42501';
  end if;

  if v_user.role in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_trips
    from (
      select *
      from public.driver_trips
      order by started_at desc
      limit 60
    ) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_trips
    from (
      select *
      from public.driver_trips
      where driver_id = v_user.id
         or status in ('handover', 'active')
      order by started_at desc
      limit 60
    ) x;
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_costs
  from (
    select entry_date, fiat_end, isuzu_end, merc_end, iveco_end
    from public.daily_costs
    order by entry_date desc
    limit 180
  ) x;

  return json_build_object(
    'ok', true,
    'trips', v_trips,
    'daily_costs', v_costs
  );
end;
$$;

create or replace function public.get_driver_app_settings(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_driver_cars jsonb := '{}'::jsonb;
  v_all_driver_cars jsonb := '{}'::jsonb;
  v_km_resolved jsonb := '[]'::jsonb;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver') then
    raise exception 'Driver data access required' using errcode = '42501';
  end if;

  select coalesce(value, '{}'::jsonb)
  into v_all_driver_cars
  from public.app_settings
  where key = 'driver_cars';

  if v_user.role = 'driver' then
    if coalesce(v_all_driver_cars, '{}'::jsonb) ? v_user.id::text then
      v_driver_cars := jsonb_build_object(v_user.id::text, v_all_driver_cars -> (v_user.id::text));
    else
      v_driver_cars := '{}'::jsonb;
    end if;
  else
    v_driver_cars := coalesce(v_all_driver_cars, '{}'::jsonb);
  end if;

  select coalesce(value, '[]'::jsonb)
  into v_km_resolved
  from public.app_settings
  where key = 'km_resolved_trips';

  return json_build_object(
    'ok', true,
    'driver_cars', coalesce(v_driver_cars, '{}'::jsonb),
    'km_resolved_ids', coalesce(v_km_resolved, '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_tunnel_bags(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select *
    from public.tunnel_bags
    order by created_at desc
    limit 200
  ) x;

  return json_build_object('ok', true, 'bags', v_rows);
end;
$$;

create or replace function public.get_blocking_picked_laundry(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_entries json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_entries
  from (
    select *
    from public.entries
    where deleted_at is null
      and done = true
      and picked_by = v_user.name
      and (delivered = false or delivered is null)
    order by added_at desc
  ) x;

  return json_build_object('ok', true, 'entries', v_entries);
end;
$$;

grant execute on function public.get_month_roster_secure(text, integer, integer, boolean) to anon, authenticated;
grant execute on function public.get_work_schedule_month(text, integer, integer) to anon, authenticated;
grant execute on function public.get_timeline_week(text, date, date, integer, integer) to anon, authenticated;
grant execute on function public.get_schedule_driver_trips(text, integer) to anon, authenticated;
grant execute on function public.get_admin_users_data(text) to anon, authenticated;
grant execute on function public.get_admin_route_options(text) to anon, authenticated;
grant execute on function public.get_admin_groups(text) to anon, authenticated;
grant execute on function public.get_admin_group_employee_count(text, text) to anon, authenticated;
grant execute on function public.get_admin_employees_data(text, integer, integer) to anon, authenticated;
grant execute on function public.get_client_usage_status(text, text) to anon, authenticated;
grant execute on function public.get_costs_month(text, text) to anon, authenticated;
grant execute on function public.get_costs_history(text, integer, text) to anon, authenticated;
grant execute on function public.get_performance_progi(text, text) to anon, authenticated;
grant execute on function public.get_driver_trips_data(text) to anon, authenticated;
grant execute on function public.get_driver_app_settings(text) to anon, authenticated;
grant execute on function public.get_tunnel_bags(text) to anon, authenticated;
grant execute on function public.get_blocking_picked_laundry(text) to anon, authenticated;

-- The original roster function is now an internal helper. The browser must use
-- get_month_roster_secure with a session token.
revoke execute on function public.get_month_roster(integer, integer, boolean) from public, anon, authenticated;
