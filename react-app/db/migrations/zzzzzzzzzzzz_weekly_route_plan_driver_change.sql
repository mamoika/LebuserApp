-- Pozwala zmienić kierowcę istniejącego przypisania bez odpinania auta.
-- BEFORE INSERT wykonuje się przed obsługą ON CONFLICT, dlatego NEW.id nie
-- identyfikuje jeszcze aktualizowanego rekordu. Kluczem edycji jest
-- (plan_date, route_id), więc właśnie tę trasę trzeba pominąć w walidacji.

begin;

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
    and assignment.route_id is distinct from new.route_id
    and assignment.id is distinct from new.id
  limit 1;

  if v_conflicting_driver_name is not null then
    raise exception 'Auto % jest już przypisane kierowcy % w tym dniu',
      new.car, v_conflicting_driver_name;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_weekly_route_plan_vehicle_owner()
  from public, anon, authenticated;

commit;
