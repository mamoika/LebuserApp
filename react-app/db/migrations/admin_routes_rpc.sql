create or replace function public.admin_create_route(
  p_session_token text,
  p_name text,
  p_schedule text default 'other',
  p_sort_order integer default 9999
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id integer;
  v_schedule text;
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Nazwa trasy jest wymagana');
  end if;

  v_schedule := lower(trim(coalesce(p_schedule, 'other')));
  if v_schedule not in ('daily', 'mwf', 'tth', 'other') then
    v_schedule := 'other';
  end if;

  perform public.reset_routes_id_sequence();

  insert into public.routes(name, schedule, sort_order)
  values (trim(p_name), v_schedule, coalesce(p_sort_order, 9999))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    perform public.reset_routes_id_sequence();
    insert into public.routes(name, schedule, sort_order)
    values (trim(p_name), v_schedule, coalesce(p_sort_order, 9999))
    returning id into v_id;
    return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_update_route(
  p_session_token text,
  p_route_id integer,
  p_name text,
  p_schedule text default 'other'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule text;
begin
  perform public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return json_build_object('error', 'Nazwa trasy jest wymagana');
  end if;

  v_schedule := lower(trim(coalesce(p_schedule, 'other')));
  if v_schedule not in ('daily', 'mwf', 'tth', 'other') then
    v_schedule := 'other';
  end if;

  update public.routes
  set name = trim(p_name), schedule = v_schedule
  where id = p_route_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_route(
  p_session_token text,
  p_route_id integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  if exists (select 1 from public.clients where route_id = p_route_id) then
    return json_build_object('error', 'Nie można usunąć trasy — ma przypisanych klientów');
  end if;

  delete from public.routes where id = p_route_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono trasy');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_create_route(text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_update_route(text, integer, text, text) to anon, authenticated;
grant execute on function public.admin_delete_route(text, integer) to anon, authenticated;

revoke execute on function public.reset_routes_id_sequence() from public, anon, authenticated;
revoke insert, update, delete on table public.routes from anon, authenticated;
