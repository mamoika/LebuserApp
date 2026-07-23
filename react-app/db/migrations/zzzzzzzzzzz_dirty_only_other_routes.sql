-- Punkty tylko po brudne mogą pochodzić z dowolnej trasy.
-- Klient nie trafia do driver_trips.extra_clients, ponieważ to pole obejmuje
-- także zadania czystego prania. Tutaj tworzymy wyłącznie jawny dirty_only stop.

begin;

drop function if exists public.driver_add_dirty_planned_stop(text, uuid, text);
drop function if exists public.admin_add_dirty_planned_stop(text, uuid, text);

create or replace function public.driver_add_dirty_planned_stop(
  p_session_token text,
  p_trip_id uuid,
  p_client_name text default null,
  p_client_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_driver record;
  v_actor record;
  v_trip public.driver_trips;
  v_client public.clients;
  v_position integer;
  v_stop public.trip_stops;
  v_is_other_route boolean;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;
  select * into v_actor from public.session_user(p_session_token) limit 1;
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id
    and driver_id = v_driver.id
    and status = 'planned'
  for update;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu kierowcy');
  end if;

  select * into v_client
  from public.clients
  where (p_client_id is not null and id = p_client_id)
     or (p_client_id is null and name = p_client_name)
  order by case when id = p_client_id then 0 else 1 end, route_id, sort_order
  limit 1;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;

  if (select count(*) from public.clients where name = v_client.name) > 1 then
    return json_build_object(
      'error',
      'Kilku klientów ma tę samą nazwę. Najpierw nadaj im unikalne nazwy.'
    );
  end if;

  v_is_other_route := not private.trip_includes_client(
    v_trip.routes, null, v_client.route_id, v_client.name
  );

  select * into v_stop
  from public.trip_stops
  where trip_id = v_trip.id
    and (
      client_id = v_client.id
      or (client_id is null and client_name = v_client.name)
    )
  limit 1;

  if v_stop.id is null and exists (
    select 1
    from public.trip_stops
    where trip_id = v_trip.id
      and client_name = v_client.name
      and client_id is distinct from v_client.id
  ) then
    return json_build_object(
      'error',
      'W kursie istnieje już inny klient o tej samej nazwie'
    );
  end if;

  if v_stop.id is not null then
    update public.trip_stops
    set stop_kind = 'dirty_only',
        status = 'pending',
        completed_at = null,
        completed_by_user_id = null,
        completed_by_name = null,
        updated_at = now()
    where id = v_stop.id
    returning * into v_stop;
  else
    select coalesce(max(position), 0) + 1
    into v_position
    from public.trip_stops
    where trip_id = v_trip.id;

    insert into public.trip_stops (
      trip_id, client_id, client_name, route_id, position, stop_kind, note
    )
    values (
      v_trip.id, v_client.id, v_client.name, v_client.route_id,
      v_position, 'dirty_only', v_client.note
    )
    returning * into v_stop;
  end if;

  perform private.sync_trip_course(v_trip.id);
  select * into v_stop from public.trip_stops where id = v_stop.id;

  insert into public.trip_events (
    trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data
  )
  values (
    v_trip.id, v_stop.id, 'dirty_stop_added', v_actor.id, v_actor.name, v_actor.role,
    'Kierowca dodał punkt po brudne: ' || v_client.name,
    jsonb_build_object(
      'client_name', v_client.name,
      'source_route_id', v_client.route_id,
      'is_other_route', v_is_other_route
    )
  );

  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

create or replace function public.admin_add_dirty_planned_stop(
  p_session_token text,
  p_trip_id uuid,
  p_client_name text default null,
  p_client_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin record;
  v_trip public.driver_trips;
  v_client public.clients;
  v_stop public.trip_stops;
  v_position integer;
  v_is_other_route boolean;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  select * into v_trip
  from public.driver_trips
  where id = p_trip_id and status = 'planned'
  for update;

  if v_trip.id is null then
    return json_build_object('error', 'Nie znaleziono planowanego kursu');
  end if;

  select * into v_client
  from public.clients
  where (p_client_id is not null and id = p_client_id)
     or (p_client_id is null and name = p_client_name)
  order by case when id = p_client_id then 0 else 1 end, route_id, sort_order
  limit 1;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;

  if (select count(*) from public.clients where name = v_client.name) > 1 then
    return json_build_object(
      'error',
      'Kilku klientów ma tę samą nazwę. Najpierw nadaj im unikalne nazwy.'
    );
  end if;

  v_is_other_route := not private.trip_includes_client(
    v_trip.routes, null, v_client.route_id, v_client.name
  );

  select * into v_stop
  from public.trip_stops
  where trip_id = v_trip.id
    and (
      client_id = v_client.id
      or (client_id is null and client_name = v_client.name)
    )
  limit 1;

  if v_stop.id is null and exists (
    select 1
    from public.trip_stops
    where trip_id = v_trip.id
      and client_name = v_client.name
      and client_id is distinct from v_client.id
  ) then
    return json_build_object(
      'error',
      'W kursie istnieje już inny klient o tej samej nazwie'
    );
  end if;

  if v_stop.id is not null then
    update public.trip_stops
    set stop_kind = 'dirty_only',
        status = 'pending',
        completed_at = null,
        completed_by_user_id = null,
        completed_by_name = null,
        updated_at = now()
    where id = v_stop.id
    returning * into v_stop;
  else
    select coalesce(max(position), 0) + 1
    into v_position
    from public.trip_stops
    where trip_id = v_trip.id;

    insert into public.trip_stops (
      trip_id, client_id, client_name, route_id, position, stop_kind, note
    )
    values (
      v_trip.id, v_client.id, v_client.name, v_client.route_id,
      v_position, 'dirty_only', v_client.note
    )
    returning * into v_stop;
  end if;

  perform private.sync_trip_course(v_trip.id);
  select * into v_stop from public.trip_stops where id = v_stop.id;

  insert into public.trip_events (
    trip_id, stop_id, event_type, actor_user_id, actor_name, actor_role, details, data
  )
  values (
    v_trip.id, v_stop.id, 'dirty_stop_added', v_admin.id, v_admin.name, v_admin.role,
    'Administrator dodał punkt po brudne: ' || v_client.name,
    jsonb_build_object(
      'client_name', v_client.name,
      'source_route_id', v_client.route_id,
      'is_other_route', v_is_other_route
    )
  );

  return json_build_object('ok', true, 'stop', row_to_json(v_stop));
end;
$$;

grant execute on function public.driver_add_dirty_planned_stop(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.admin_add_dirty_planned_stop(text, uuid, text, uuid) to anon, authenticated;

commit;
