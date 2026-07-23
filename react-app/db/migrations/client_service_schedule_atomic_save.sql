-- Atomowy zapis klienta/trasy razem z planem obsługi.
-- Błąd reguł cofa także utworzenie lub edycję rekordu głównego.

begin;

create or replace function public.admin_create_route_with_service_rules(
  p_session_token text,
  p_name text,
  p_rules jsonb,
  p_sort_order integer default 9999,
  p_is_workwear boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_plan json;
  v_route_id integer;
begin
  v_result := public.admin_create_route(
    p_session_token, p_name, 'other', p_sort_order, p_is_workwear
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  v_route_id := (v_result->>'id')::integer;
  v_plan := public.admin_save_route_service_rules(
    p_session_token, v_route_id, p_rules
  );
  if v_plan->>'error' is not null then
    raise exception '%', v_plan->>'error' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.admin_update_route_with_service_rules(
  p_session_token text,
  p_route_id integer,
  p_name text,
  p_rules jsonb,
  p_is_workwear boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_plan json;
begin
  v_result := public.admin_update_route(
    p_session_token, p_route_id, p_name, 'other', p_is_workwear
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  v_plan := public.admin_save_route_service_rules(
    p_session_token, p_route_id, p_rules
  );
  if v_plan->>'error' is not null then
    raise exception '%', v_plan->>'error' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.admin_insert_client_with_service_rules(
  p_session_token text,
  p_name text,
  p_route_id integer,
  p_mode text,
  p_rules jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_plan json;
  v_client_id uuid;
begin
  v_result := public.admin_insert_client(
    p_session_token, p_name, p_route_id
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  v_client_id := (v_result->>'id')::uuid;
  v_plan := public.admin_save_client_service_rules(
    p_session_token, v_client_id, p_mode, p_rules
  );
  if v_plan->>'error' is not null then
    raise exception '%', v_plan->>'error' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

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
begin
  v_result := public.admin_update_client(
    p_session_token, p_id, p_name, p_route_id, p_lat, p_lng
  );
  if v_result->>'error' is not null then
    return v_result;
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

grant execute on function public.admin_create_route_with_service_rules(
  text, text, jsonb, integer, boolean
) to anon, authenticated;
grant execute on function public.admin_update_route_with_service_rules(
  text, integer, text, jsonb, boolean
) to anon, authenticated;
grant execute on function public.admin_insert_client_with_service_rules(
  text, text, integer, text, jsonb
) to anon, authenticated;
grant execute on function public.admin_update_client_with_service_rules(
  text, uuid, text, integer, numeric, numeric, text, jsonb
) to anon, authenticated;

commit;
