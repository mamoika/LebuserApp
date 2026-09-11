-- Przypisanie trasy nie jest już stałą właściwością konta (users.routes).
-- Źródłem prawdy jest konkretny kurs w driver_trips: kierowca + data + trasa.

create or replace function private.driver_can_read_entry(
  p_driver_id uuid,
  p_driver_name text,
  p_entry_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, private, extensions
as $$
  select exists (
    select 1
    from public.entries e
    where e.id = p_entry_id
      and (
        e.picked_by = p_driver_name
        or e.delivered_by = p_driver_name
        or e.added_by = p_driver_name
        or exists (
          select 1
          from public.trip_stop_tasks task
          join public.trip_stops stop on stop.id = task.stop_id
          join public.driver_trips trip on trip.id = stop.trip_id
          where task.entry_id = e.id
            and trip.driver_id = p_driver_id
        )
      )
  );
$$;

revoke execute on function private.driver_can_read_entry(uuid, text, text) from public, anon, authenticated;

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
    -- Tylko kursy tego kierowcy (oraz kurs przekazany do przejęcia), nigdy users.routes.
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
        select unnest(v_trip_route_ids) as route_id
        union
        select c.route_id
        from public.clients c
        where c.name = any(v_extra_client_names)
      ) visible_routes
      where route_id is not null
    );

    v_visible_client_names := array(
      select distinct c.name
      from public.clients c
      where c.route_id = any(v_visible_route_ids)
         or c.name = any(v_extra_client_names)
    );

    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_clients
    from (
      select * from public.clients
      where name = any(v_visible_client_names)
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_routes
    from (
      select * from public.routes
      where id = any(v_visible_route_ids)
      order by sort_order
    ) x;

    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_entries
    from (
      select * from public.entries
      where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
        and (
          route_id = any(v_visible_route_ids)
          or client_name = any(v_visible_client_names)
          or picked_by = v_user.name
          or delivered_by = v_user.name
          or added_by = v_user.name
        )
    ) x;

    if to_regclass('public.laundry_receipts') is not null then
      select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_receipts
      from (
        select * from public.laundry_receipts
        where deleted_at is null and client_name = any(v_visible_client_names)
        order by doc_no desc
      ) x;
    end if;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_clients
    from (select * from public.clients order by sort_order) x;
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_routes
    from (select * from public.routes order by sort_order) x;
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_entries
    from (
      select * from public.entries
      where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
    ) x;
    if to_regclass('public.laundry_receipts') is not null then
      execute
        'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
         from (select * from public.laundry_receipts where deleted_at is null order by doc_no desc) x'
      into v_receipts;
    end if;
  end if;

  return json_build_object(
    'ok', true, 'clients', v_clients, 'routes', v_routes,
    'entries', v_entries, 'receipts', v_receipts
  );
end;
$$;

create or replace function public.get_history_entries(
  p_session_token text,
  p_limit integer default 1500
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_limit integer := least(greatest(coalesce(p_limit, 1500), 1), 2000);
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role in ('driver', 'admin_viewer_driver') then
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
    from (
      select * from public.entries e
      where private.driver_can_read_entry(v_user.id, v_user.name, e.id)
      order by added_at desc
      limit v_limit
    ) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
    from (select * from public.entries order by added_at desc limit v_limit) x;
  end if;
  return json_build_object('ok', true, 'entries', v_rows);
end;
$$;

create or replace function public.get_entry_logs(p_session_token text, p_entry_id text)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if nullif(trim(coalesce(p_entry_id, '')), '') is null then
    return json_build_object('error', 'Brak id wpisu');
  end if;
  if not exists (select 1 from public.entries where id = p_entry_id) then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;
  if v_user.role not in ('admin', 'admin_viewer')
     and not private.driver_can_read_entry(v_user.id, v_user.name, p_entry_id) then
    raise exception 'Entry access denied' using errcode = '42501';
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

create or replace function public.driver_start_trip(
  p_session_token text,
  p_planned_trip_id uuid default null,
  p_trip_date date default null,
  p_car text default null,
  p_routes text default ''
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_car text := trim(coalesce(p_car, ''));
  v_trip_date date := coalesce(p_trip_date, public.lebuser_operational_date());
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;
  if v_car <> '' and exists (
    select 1 from public.driver_trips
    where status = 'active' and car = v_car and driver_id is distinct from v_user.id
  ) then
    return json_build_object('error', 'To auto jest już na trasie u innego kierowcy');
  end if;

  if p_planned_trip_id is null and v_user.role = 'driver' then
    return json_build_object('error', 'Kurs musi zostać najpierw przypisany w planie tras');
  end if;

  if p_planned_trip_id is not null then
    select * into v_trip from public.driver_trips where id = p_planned_trip_id;
    if v_trip.id is null then return json_build_object('error', 'Nie znaleziono zaplanowanej trasy'); end if;
    if v_trip.status <> 'planned' then return json_build_object('error', 'Ta trasa nie jest zaplanowana'); end if;
    if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then
      return json_build_object('error', 'To nie Twoja trasa');
    end if;
    update public.driver_trips
    set car = coalesce(nullif(v_car, ''), car),
        -- Kierowca nie może zmienić zestawu tras z tygodniowego przydziału.
        routes = case when v_user.role = 'admin' then coalesce(nullif(p_routes, ''), routes) else routes end,
        status = 'active', started_at = now(),
        driver_id = coalesce(driver_id, v_user.id),
        driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
    insert into public.driver_trips (driver_id, driver_name, trip_date, car, routes, status, started_at)
    values (v_user.id, v_user.name, v_trip_date, v_car, coalesce(p_routes, ''), 'planned', null)
    returning * into v_trip;
  end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.get_app_data(text, text) to anon, authenticated;
grant execute on function public.get_history_entries(text, integer) to anon, authenticated;
grant execute on function public.get_entry_logs(text, text) to anon, authenticated;
grant execute on function public.driver_start_trip(text, uuid, date, text, text) to anon, authenticated;
