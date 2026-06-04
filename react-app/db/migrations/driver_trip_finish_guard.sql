-- Serwerowa blokada kończenia trasy z praniem odebranym z pralni,
-- które nie zostało dostarczone albo cofnięte do pralni.

create or replace function public.lebuser_pickup_date(
  p_week_key text,
  p_pick_week_key text,
  p_pick_day integer
) returns date
language sql
immutable
as $$
  select (
    coalesce(nullif(p_pick_week_key, ''), nullif(p_week_key, ''))::date
    + (greatest(coalesce(p_pick_day, 1), 1) - 1)
  )::date
$$;

create or replace function public.driver_trip_assert_can_finish()
returns trigger
language plpgsql
as $$
declare
  blocking_clients text;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    select string_agg(distinct e.client_name, ', ' order by e.client_name)
      into blocking_clients
    from public.entries e
    where e.deleted_at is null
      and e.done is true
      and coalesce(e.delivered, false) is false
      and e.picked_by = new.driver_name
      and public.lebuser_pickup_date(e.week_key, e.pick_week_key, e.pick_day) = new.trip_date
      and (
        coalesce(new.routes, '') = ''
        or e.route_id = any(string_to_array(new.routes, ',')::int[])
        or (
          new.extra_clients is not null
          and jsonb_typeof(new.extra_clients::jsonb) = 'array'
          and (new.extra_clients::jsonb ? e.client_name)
        )
      );

    if blocking_clients is not null then
      raise exception
        'Nie można zakończyć trasy. Najpierw dostarcz albo cofnij do pralni: %',
        blocking_clients;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists driver_trip_finish_guard on public.driver_trips;
create trigger driver_trip_finish_guard
before update of status on public.driver_trips
for each row
execute function public.driver_trip_assert_can_finish();

alter table public.driver_trips
  alter column car drop not null;

alter table public.driver_trips
  drop constraint if exists driver_trips_status_check;

alter table public.driver_trips
  add constraint driver_trips_status_check
  check (status in ('planned', 'active', 'finished'));
