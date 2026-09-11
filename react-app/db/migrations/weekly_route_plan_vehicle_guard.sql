-- Jedno auto może być przypisane tylko jednemu kierowcy w danym dniu.
-- Ten sam kierowca może korzystać z tego auta na kilku trasach tego dnia.

begin;

create index if not exists driver_route_plan_assignments_date_car_idx
  on public.driver_route_plan_assignments (plan_date, lower(car))
  where car is not null;

create or replace function public.enforce_weekly_route_plan_vehicle_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_conflicting_driver_name text;
begin
  new.car := nullif(trim(coalesce(new.car, '')), '');
  if new.car is null then return new; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.plan_date::text || '|' || lower(new.car), 0)
  );

  select assignment.driver_name
  into v_conflicting_driver_name
  from public.driver_route_plan_assignments assignment
  where assignment.plan_date = new.plan_date
    and lower(assignment.car) = lower(new.car)
    and assignment.driver_id is distinct from new.driver_id
    and assignment.id is distinct from new.id
  limit 1;

  if v_conflicting_driver_name is not null then
    raise exception 'Auto % jest już przypisane kierowcy % w tym dniu',
      new.car, v_conflicting_driver_name;
  end if;

  return new;
end;
$$;

drop trigger if exists weekly_route_plan_vehicle_owner_guard
  on public.driver_route_plan_assignments;
create trigger weekly_route_plan_vehicle_owner_guard
before insert or update of plan_date, car, driver_id
on public.driver_route_plan_assignments
for each row execute function public.enforce_weekly_route_plan_vehicle_owner();

revoke all on function public.enforce_weekly_route_plan_vehicle_owner()
  from public, anon, authenticated;

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
set search_path = public, extensions
as $$
declare
  v_driver record;
  v_assignment public.driver_route_plan_assignments;
  v_car text := nullif(trim(coalesce(p_car, '')), '');
  v_conflicting_driver_name text;
begin
  perform public.require_admin(p_session_token);
  if p_route_id is null or not exists (select 1 from public.routes where id = p_route_id) then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  if p_trip_date is null or p_driver_id is null then
    return json_build_object('error', 'Wybierz dzień i kierowcę');
  end if;

  select id, name into v_driver
  from public.users
  where id = p_driver_id and role in ('admin', 'admin_viewer_driver', 'driver');
  if v_driver.id is null then
    return json_build_object('error', 'Nie znaleziono kierowcy');
  end if;

  if v_car is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_trip_date::text || '|' || lower(v_car), 0)
    );

    select assignment.driver_name
    into v_conflicting_driver_name
    from public.driver_route_plan_assignments assignment
    where assignment.plan_date = p_trip_date
      and lower(assignment.car) = lower(v_car)
      and assignment.driver_id is distinct from p_driver_id
      and assignment.route_id is distinct from p_route_id
    limit 1;

    if v_conflicting_driver_name is not null then
      return json_build_object(
        'error',
        format('Auto %s jest już przypisane kierowcy %s w tym dniu', v_car, v_conflicting_driver_name)
      );
    end if;
  end if;

  insert into public.driver_route_plan_assignments (
    plan_date, route_id, driver_id, driver_name, car, planned_start, updated_at
  ) values (
    p_trip_date, p_route_id, v_driver.id, v_driver.name,
    v_car, p_planned_start, now()
  )
  on conflict (plan_date, route_id) do update
  set driver_id = excluded.driver_id,
      driver_name = excluded.driver_name,
      car = excluded.car,
      planned_start = excluded.planned_start,
      updated_at = now()
  returning * into v_assignment;

  return json_build_object(
    'ok', true,
    'assignment', json_build_object(
      'id', v_assignment.id,
      'driver_id', v_assignment.driver_id,
      'driver_name', v_assignment.driver_name,
      'trip_date', v_assignment.plan_date,
      'routes', v_assignment.route_id::text,
      'car', v_assignment.car,
      'planned_start', v_assignment.planned_start,
      'status', 'informational'
    )
  );
end;
$$;

grant execute on function public.admin_upsert_weekly_route_assignment(
  text, integer, date, uuid, text, timestamptz
) to anon, authenticated;

commit;
