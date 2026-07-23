-- Fix route-card swaps when admin_move_route_card runs with search_path = ''.
-- PostgreSQL resolves an unqualified SET CONSTRAINTS name through search_path,
-- so the original function could not see the constraint in the public schema.

create or replace function public.admin_move_route_card(
  p_session_token text,
  p_route_id integer,
  p_target_position integer
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_position integer;
  v_occupant_id integer;
begin
  perform public.require_admin(p_session_token);

  if p_target_position is null or p_target_position < 1 then
    raise exception 'Invalid route grid position';
  end if;

  select route.grid_position
  into v_current_position
  from public.routes as route
  where route.id = p_route_id
  for update;

  if not found then
    raise exception 'Route not found';
  end if;

  if v_current_position = p_target_position then
    return json_build_object(
      'ok', true,
      'route_id', p_route_id,
      'grid_position', p_target_position
    );
  end if;

  select route.id
  into v_occupant_id
  from public.routes as route
  where route.grid_position = p_target_position
    and route.id <> p_route_id
  for update;

  set constraints public.routes_grid_position_unique deferred;

  update public.routes
  set grid_position = p_target_position
  where id = p_route_id;

  if v_occupant_id is not null then
    update public.routes
    set grid_position = v_current_position
    where id = v_occupant_id;
  end if;

  return json_build_object(
    'ok', true,
    'route_id', p_route_id,
    'grid_position', p_target_position,
    'swapped_route_id', v_occupant_id,
    'swapped_grid_position', case
      when v_occupant_id is null then null
      else v_current_position
    end
  );
end;
$$;

revoke execute on function public.admin_move_route_card(text, integer, integer)
from public;
grant execute on function public.admin_move_route_card(text, integer, integer)
to anon, authenticated;
