-- Przy zmianie nazwy lub trasy klienta najpierw aktualizujemy otwarte punkty.
-- Dzięki temu synchronizacja planu nie porównuje nieaktualnych pól punktu.

begin;

create or replace function public.admin_update_client_with_service_rules(
  p_session_token text,
  p_id uuid,
  p_name text,
  p_route_id integer,
  p_lat numeric default null,
  p_lng numeric default null,
  p_mode text default 'inherit',
  p_rules jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_plan json;
  v_old_name text;
  v_new_name text := trim(p_name);
begin
  perform public.require_admin(p_session_token);

  select name into v_old_name
  from public.clients
  where id = p_id;

  v_result := public.admin_update_client(
    p_session_token, p_id, p_name, p_route_id, p_lat, p_lng
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  update public.trip_stops stop
  set client_id = p_id,
      client_name = v_new_name,
      route_id = p_route_id,
      updated_at = now()
  from public.driver_trips trip
  where stop.trip_id = trip.id
    and trip.status in ('planned', 'active', 'handover')
    and trip.trip_date >= (now() at time zone 'Europe/Warsaw')::date
    and (
      stop.client_id = p_id
      or (
        stop.client_id is null
        and stop.client_name = v_old_name
      )
    );

  if v_new_name is distinct from v_old_name then
    update public.driver_trips trip
    set extra_clients = (
      select coalesce(
        jsonb_agg(
          case when item.value = v_old_name then v_new_name else item.value end
          order by item.ordinality
        )::text,
        '[]'
      )
      from jsonb_array_elements_text(
        coalesce(nullif(trip.extra_clients, ''), '[]')::jsonb
      ) with ordinality as item(value, ordinality)
    )
    where trip.status in ('planned', 'active', 'handover')
      and trip.trip_date >= (now() at time zone 'Europe/Warsaw')::date
      and coalesce(nullif(trip.extra_clients, ''), '[]')::jsonb ? v_old_name;
  end if;

  v_plan := public.admin_save_client_service_rules(
    p_session_token, p_id, p_mode, p_rules
  );
  if v_plan->>'error' is not null then
    raise exception '%', v_plan->>'error' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

grant execute on function public.admin_update_client_with_service_rules(
  text, uuid, text, integer, numeric, numeric, text, jsonb
) to anon, authenticated;

commit;
