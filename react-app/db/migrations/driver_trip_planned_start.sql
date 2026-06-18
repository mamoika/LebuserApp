-- =====================================================================
-- Planowany start trasy (data + godzina) + auto-start o wyznaczonej porze.
-- ---------------------------------------------------------------------
-- Dotąd planowana trasa nie miała pola startu — karta pokazywała started_at
-- (NOT NULL DEFAULT now()), czyli moment ZAPLANOWANIA, co myliło.
-- Teraz:
--   * driver_trips.planned_start (timestamptz) — kiedy trasa ma ruszyć,
--   * admin_plan_driver_trip przyjmuje p_planned_start,
--   * admin_set_trip_planned_start — edycja terminu istniejącej trasy,
--   * auto_start_due_trips — promuje planned → active, gdy nadszedł czas
--     (started_at ustawiany na planned_start). Wywoływane przy ładowaniu
--     tras (kierowca/admin), więc gdy ktokolwiek otworzy aplikację po
--     planowanej godzinie, trasa jest już rozpoczęta.
-- =====================================================================

alter table public.driver_trips add column if not exists planned_start timestamptz;

-- Rozszerzenie planowania o termin startu (dodanie parametru = nowa sygnatura).
drop function if exists public.admin_plan_driver_trip(text, uuid, date, text, text, text);

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
      return json_build_object('error', 'Nie znaleziono kierowcy');
    end if;
  end if;

  insert into public.driver_trips (
    driver_id, driver_name, trip_date, car, routes, status, extra_clients, planned_start
  )
  values (
    v_driver_id, v_driver_name, p_trip_date,
    trim(coalesce(p_car, '')), coalesce(p_routes, ''), 'planned', p_extra_clients, p_planned_start
  )
  returning * into v_trip;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

-- Edycja terminu startu istniejącej (planowanej) trasy.
create or replace function public.admin_set_trip_planned_start(
  p_session_token text,
  p_trip_id uuid,
  p_planned_start timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.driver_trips;
begin
  perform public.require_admin(p_session_token);

  update public.driver_trips
  set planned_start = p_planned_start
  where id = p_trip_id
  returning * into v_trip;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;
  return json_build_object('ok', true, 'trip', row_to_json(v_trip));
end;
$$;

-- Auto-start: planned → active, gdy minął planned_start. started_at = planned_start.
-- Idempotentne (drugi raz nic nie złapie). Dozwolone dla zalogowanego (require_driver).
create or replace function public.auto_start_due_trips(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer;
begin
  perform * from public.require_driver(p_session_token);

  update public.driver_trips
  set status = 'active',
      started_at = planned_start
  where status = 'planned'
    and planned_start is not null
    and planned_start <= now();

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'started', v_affected);
end;
$$;

grant execute on function public.admin_plan_driver_trip(text, uuid, date, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_set_trip_planned_start(text, uuid, timestamptz) to anon, authenticated;
grant execute on function public.auto_start_due_trips(text) to anon, authenticated;

-- Pełny serwerowy auto-start bez otwartej aplikacji jest w osobnej migracji:
-- driver_trip_auto_start_cron.sql
