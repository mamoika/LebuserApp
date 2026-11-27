begin;

create or replace function public.enforce_weekly_route_plan_vehicle_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_name text;
begin
  new.car := nullif(trim(coalesce(new.car, '')), '');
  if new.car is null or new.planned_start is null then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.plan_date::text || '|' || lower(new.car), 0)
  );

  select assignment.driver_name into v_driver_name
  from public.driver_route_plan_assignments assignment
  where assignment.plan_date = new.plan_date
    and lower(assignment.car) = lower(new.car)
    and date_trunc('minute', assignment.planned_start) = date_trunc('minute', new.planned_start)
    -- One dispatch course can publish several routes for the same driver.
    and assignment.driver_id is distinct from new.driver_id
    and assignment.route_id is distinct from new.route_id
    and assignment.id is distinct from new.id
  limit 1;

  if found then
    raise exception 'weekly_plan_vehicle_start_conflict' using detail = coalesce(v_driver_name, '');
  end if;
  return new;
end;
$$;

drop trigger weekly_route_plan_vehicle_owner_guard on public.driver_route_plan_assignments;
create trigger weekly_route_plan_vehicle_owner_guard
before insert or update of plan_date, route_id, car, driver_id, planned_start
on public.driver_route_plan_assignments
for each row execute function public.enforce_weekly_route_plan_vehicle_owner();

create or replace function public.admin_upsert_weekly_route_assignment(
  p_session_token text,
  p_route_id integer,
  p_trip_date date,
  p_driver_id uuid,
  p_car text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
  v_assignment public.driver_route_plan_assignments;
begin
  perform private.require_route_plan_editor(p_session_token);
  if p_route_id is null or not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if p_trip_date is null or p_driver_id is null then
    return json_build_object('error', 'Wybierz dzień i kierowcę');
  end if;

  select id, name into v_driver
  from public.users
  where id = p_driver_id and role in ('admin', 'admin_viewer_driver', 'driver')
    and coalesce(is_archived, false) = false;
  if v_driver.id is null then
    return json_build_object('error', 'Kierowca nie istnieje lub jego konto jest zablokowane');
  end if;

  insert into public.driver_route_plan_assignments (
    route_id, plan_date, driver_id, driver_name, car, planned_start
  ) values (
    p_route_id, p_trip_date, v_driver.id, v_driver.name, nullif(trim(coalesce(p_car, '')), ''), p_planned_start
  )
  on conflict (route_id, plan_date) do update
  set driver_id = excluded.driver_id,
      driver_name = excluded.driver_name,
      car = excluded.car,
      planned_start = excluded.planned_start,
      updated_at = now()
  returning * into v_assignment;

  return json_build_object('ok', true, 'assignment', row_to_json(v_assignment));
end;
$$;

create unique index driver_trips_running_vehicle_uidx
  on public.driver_trips (lower(trim(car)))
  where status in ('active', 'handover') and nullif(trim(car), '') is not null;

create function private.guard_running_course_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_car text := nullif(lower(trim(coalesce(new.car, ''))), '');
  v_driver_name text;
begin
  if new.status not in ('active', 'handover') then return new; end if;
  if v_car is null then raise exception 'course_vehicle_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('running-course-vehicle|' || v_car, 0));
  select other.driver_name into v_driver_name
  from public.driver_trips other
  where other.id is distinct from new.id
    and other.status in ('active', 'handover')
    and nullif(trim(other.car), '') is not null
    and lower(trim(other.car)) = v_car
  limit 1;

  if found then
    raise exception 'course_vehicle_in_use' using detail = coalesce(v_driver_name, '');
  end if;
  return new;
end;
$$;

create trigger driver_trip_running_vehicle_guard
before insert or update of status, car on public.driver_trips
for each row execute function private.guard_running_course_vehicle();

-- Preparing a course does not reserve the vehicle. The transition to an
-- operational status is checked for all writers by the trigger.
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
set search_path = ''
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_car text := trim(coalesce(p_car, ''));
  v_trip_date date := coalesce(p_trip_date, public.lebuser_operational_date());
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver') then raise exception 'Driver session required' using errcode = '42501'; end if;

  if p_planned_trip_id is not null then
    select * into v_trip from public.driver_trips where id = p_planned_trip_id for update;
    if v_trip.id is null then return json_build_object('error', 'Nie znaleziono zaplanowanej trasy'); end if;
    if v_trip.status <> 'planned' then return json_build_object('error', 'Ta trasa nie jest zaplanowana'); end if;
    if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then return json_build_object('error', 'To nie Twoja trasa'); end if;
    update public.driver_trips
    set car = coalesce(nullif(v_car, ''), car),
        routes = coalesce(nullif(p_routes, ''), routes),
        status = 'active', started_at = now(),
        driver_id = coalesce(driver_id, v_user.id), driver_name = coalesce(driver_name, v_user.name)
    where id = p_planned_trip_id
    returning * into v_trip;
  else
    if exists (
      select 1 from public.driver_trips
      where driver_id = v_user.id and trip_date = v_trip_date and status = 'active'
    ) then return json_build_object('error', 'Masz już aktywną trasę'); end if;
    select * into v_trip from public.driver_trips
    where driver_id = v_user.id and status = 'planned'
    order by (trip_date = v_trip_date) desc, trip_date desc, id desc limit 1;
    if v_trip.id is not null then return json_build_object('ok', true, 'trip', row_to_json(v_trip)); end if;
    insert into public.driver_trips (
      driver_id, driver_name, trip_date, car, routes, status, started_at,
      planning_source, planned_by_user_id, planned_by_name
    ) values (
      v_user.id, v_user.name, v_trip_date, v_car, coalesce(p_routes, ''), 'planned', null,
      'driver', v_user.id, v_user.name
    )
    returning * into v_trip;
  end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create function public.set_planned_course_vehicle(p_session_token text, p_trip_id uuid, p_car text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_car text := nullif(lower(trim(coalesce(p_car, ''))), '');
begin
  select * into v_user from public.require_driver(p_session_token) limit 1;
  if v_car is null or v_car not in ('fiat', 'isuzu', 'merc', 'iveco') then
    return json_build_object('error', 'course_vehicle_required');
  end if;

  update public.driver_trips
  set car = v_car
  where id = p_trip_id and status = 'planned'
    and (v_user.role = 'admin' or driver_id = v_user.id)
  returning * into v_trip;
  if not found then return json_build_object('error', 'course_vehicle_plan_changed'); end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

create or replace function public.auto_start_due_trips_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip record;
  v_affected integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('auto-start-due-courses', 0)) then
    return 0;
  end if;

  for v_trip in
    select trip.id, trip.planned_start from public.driver_trips trip
    where trip.status = 'planned' and trip.planned_start <= now() and nullif(trim(trip.car), '') is not null
      -- Shared vehicles are started explicitly after the driver verifies availability.
      and not exists (
        select 1 from public.driver_route_plan_assignments assignment
        where assignment.plan_date = trip.trip_date and lower(assignment.car) = lower(trim(trip.car))
          and assignment.driver_id is distinct from trip.driver_id
      )
      and not exists (
        select 1 from public.driver_trips other
        where other.trip_date = trip.trip_date and lower(trim(other.car)) = lower(trim(trip.car))
          and other.driver_id is distinct from trip.driver_id
          and other.status in ('planned', 'active', 'handover', 'finished')
      )
    order by trip.planned_start, trip.id
    for update skip locked
  loop
    begin
      update public.driver_trips set status = 'active', started_at = v_trip.planned_start
      where id = v_trip.id;
      v_affected := v_affected + 1;
    exception when raise_exception then
      if sqlerrm <> 'course_vehicle_in_use' then raise; end if;
    end;
  end loop;
  return v_affected;
end;
$$;

revoke all on function private.guard_running_course_vehicle() from public, anon, authenticated;
revoke all on function public.set_planned_course_vehicle(text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_planned_course_vehicle(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
