-- Keep the operational route number (sort_order -> T1, T2, ...)
-- independent from the card's visual slot on the Clients & Routes board.

alter table public.routes
  add column if not exists grid_position integer;

with ranked_routes as (
  select
    id,
    row_number() over (
      order by coalesce(sort_order, 2147483647), id
    )::integer as grid_position
  from public.routes
)
update public.routes as route
set grid_position = ranked.grid_position
from ranked_routes as ranked
where route.id = ranked.id
  and route.grid_position is null;

alter table public.routes
  drop constraint if exists routes_grid_position_positive;

alter table public.routes
  add constraint routes_grid_position_positive
  check (grid_position is null or grid_position > 0);

alter table public.routes
  drop constraint if exists routes_grid_position_unique;

alter table public.routes
  add constraint routes_grid_position_unique
  unique (grid_position)
  deferrable initially immediate;

create or replace function private.assign_route_grid_position()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.grid_position is null then
    select candidate.position
    into new.grid_position
    from generate_series(
      1,
      greatest((select count(*)::integer + 1 from public.routes), 1)
    ) as candidate(position)
    where not exists (
      select 1
      from public.routes as route
      where route.grid_position = candidate.position
    )
    order by candidate.position
    limit 1;
  end if;

  return new;
end;
$$;

revoke execute on function private.assign_route_grid_position()
from public, anon, authenticated;

drop trigger if exists routes_assign_grid_position on public.routes;
create trigger routes_assign_grid_position
before insert on public.routes
for each row
execute function private.assign_route_grid_position();

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

  set constraints routes_grid_position_unique deferred;

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
