-- Planowany kurs (status=planned) nie ma jeszcze czasu startu przejazdu.
-- started_at ustawiane dopiero przy przejściu planned → active.

alter table public.driver_trips alter column started_at drop not null;

create or replace function public.admin_plan_driver_trip(
  p_session_token text,
  p_driver_id uuid,
  p_trip_date date,
  p_car text default null,
  p_routes text default '',
  p_extra_clients text default null,
  p_planned_start timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver_id uuid;
  v_driver_name text;
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);

  if p_trip_date is null then
    return json_build_object('error', 'Brak daty trasy');
  end if;

  if p_driver_id is not null then
    select id, name into v_driver_id, v_driver_name
    from public.users
    where id = p_driver_id
      and role in ('admin', 'driver');

    if v_driver_id is null then
      return json_build_object('error', 'Nieznaleziono kierowcy');
    end if;
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients, planned_start, started_at
  )
  values (
    v_driver_id, v_driver_name, p_trip_date,
    trim(coalesce(p_car, '')), coalesce(p_routes, ''), 'planned', p_extra_clients, p_planned_start, null
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text, timestamptz) to anon, authenticated;
