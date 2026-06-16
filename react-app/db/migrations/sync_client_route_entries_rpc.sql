-- Synchronizacja tras klienta z otwartymi wpisami kierowcy.
-- Bez tego po przeniesieniu klienta między trasami driver view może dalej
-- czytać stare entries.route_id.

create or replace function public.admin_update_client(
  p_session_token text,
  p_id uuid,
  p_name text,
  p_route_id integer,
  p_lat numeric default null,
  p_lng numeric default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  perform public.require_admin(p_session_token);

  select name, route_id into v_old from public.clients where id = p_id;
  if v_old is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;

  update public.clients set
    name       = trim(p_name),
    route_id   = p_route_id,
    lat        = p_lat,
    lng        = p_lng,
    sort_order = case when p_route_id is distinct from v_old.route_id then 9999 else sort_order end
  where id = p_id;

  if trim(p_name) is distinct from v_old.name then
    update public.entries set client_name = trim(p_name) where client_name = v_old.name;
  end if;

  if p_route_id is distinct from v_old.route_id then
    update public.entries
    set route_id = p_route_id
    where client_name = trim(p_name)
      and deleted_at is null
      and (
        coalesce(done, false) = false
        or coalesce(delivered, false) = false
      );
  end if;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_reorder_clients(
  p_session_token text,
  p_updates jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_client_name text;
begin
  perform public.require_admin(p_session_token);

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    return json_build_object('error', 'Nieprawidłowe dane kolejności');
  end if;

  for v_row in select * from jsonb_array_elements(p_updates)
  loop
    select name into v_client_name
    from public.clients
    where id = (v_row->>'id')::uuid;

    update public.clients set
      route_id   = (v_row->>'route_id')::integer,
      sort_order = (v_row->>'sort_order')::integer
    where id = (v_row->>'id')::uuid;

    update public.entries
    set route_id = (v_row->>'route_id')::integer
    where client_name = v_client_name
      and deleted_at is null
      and (
        coalesce(done, false) = false
        or coalesce(delivered, false) = false
      );
  end loop;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reorder_clients(text, jsonb) to anon, authenticated;
grant execute on function public.admin_update_client(text, uuid, text, integer, numeric, numeric) to anon, authenticated;
