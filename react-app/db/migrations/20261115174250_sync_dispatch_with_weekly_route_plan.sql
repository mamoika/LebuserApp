-- Dyspozytornia i tygodniowy plan tras korzystają z tych samych przypisań.
-- Utworzenie kursu operacyjnego przez administratora zapisuje kierowcę,
-- auto i godzinę również w planie tygodniowym w tej samej transakcji.

create or replace function public.admin_plan_driver_trip(
  p_session_token text,
  p_driver_id uuid,
  p_trip_date date,
  p_car text default null,
  p_routes text default null,
  p_extra_clients text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin record;
  v_driver_id uuid;
  v_driver_name text;
  v_route_ids integer[] := private.weekly_route_ids(p_routes);
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;

  if p_trip_date is null then
    return json_build_object('error', 'Brak daty trasy');
  end if;

  if p_driver_id is not null then
    select id, name into v_driver_id, v_driver_name
    from public.users
    where id = p_driver_id
      and role in ('admin', 'driver')
      and coalesce(is_archived, false) = false;

    if v_driver_id is null then
      return json_build_object('error', 'Nie znaleziono kierowcy lub jego konto zostało zablokowane');
    end if;
  end if;

  if v_driver_id is not null and cardinality(v_route_ids) > 0 then
    insert into public.driver_route_plan_assignments (
      plan_date, route_id, driver_id, driver_name, car, planned_start, updated_at
    )
    select
      p_trip_date,
      planned_route.route_id,
      v_driver_id,
      v_driver_name,
      nullif(trim(coalesce(p_car, '')), ''),
      p_planned_start,
      now()
    from unnest(v_route_ids) as planned_route(route_id)
    on conflict (plan_date, route_id) do update
    set driver_id = excluded.driver_id,
        driver_name = excluded.driver_name,
        car = excluded.car,
        planned_start = excluded.planned_start,
        updated_at = now();
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients,
    planned_start, started_at, planning_source, planned_by_user_id, planned_by_name
  ) values (
    v_driver_id, v_driver_name, p_trip_date,
    trim(coalesce(p_car, '')), coalesce(p_routes, ''), 'planned', p_extra_clients,
    p_planned_start, null, 'dispatcher', v_admin.id, v_admin.name
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

revoke all on function public.admin_plan_driver_trip(
  text, uuid, date, text, text, text, timestamptz
) from public;

grant execute on function public.admin_plan_driver_trip(
  text, uuid, date, text, text, text, timestamptz
) to anon, authenticated;
