-- Rodzaje prania należą do punktu klienta, nie do całej trasy.
-- Kody: P = pościel, O = obrusy, F = frotte/ręczniki, R = odzież.

begin;

alter table public.clients
  add column if not exists laundry_categories text[] not null
  default array['P', 'O']::text[];

alter table public.clients
  drop constraint if exists clients_laundry_categories_allowed;

alter table public.clients
  add constraint clients_laundry_categories_allowed
  check (
    laundry_categories <@ array['P', 'O', 'F', 'R']::text[]
    and array_position(laundry_categories, null) is null
  );

-- Zachowanie poprzedniego działania: dawna trasa odzieżowa staje się ofertą
-- odzieżową każdego jej klienta, pozostałe punkty zachowują P + O.
update public.clients client
set laundry_categories = case
  when coalesce(route.is_workwear, false) then array['R']::text[]
  else array['P', 'O']::text[]
end
from public.routes route
where route.id = client.route_id;

-- Flaga zostaje w schemacie dla zgodności starszych funkcji, ale nie steruje
-- już żadnym zachowaniem aplikacji.
update public.routes set is_workwear = false where is_workwear is true;

create or replace function private.normalized_laundry_categories(
  p_categories text[]
)
returns text[]
language sql
immutable
set search_path = public, private
as $$
  select coalesce(
    array_agg(allowed.code order by allowed.position),
    '{}'::text[]
  )
  from (
    values ('P'::text, 1), ('O'::text, 2), ('F'::text, 3), ('R'::text, 4)
  ) as allowed(code, position)
  where allowed.code = any(coalesce(p_categories, '{}'::text[]));
$$;

revoke execute on function private.normalized_laundry_categories(text[])
from public, anon, authenticated;

create or replace function public.admin_insert_client_with_service_rules(
  p_session_token text,
  p_name text,
  p_route_id integer,
  p_mode text,
  p_rules jsonb,
  p_laundry_categories text[]
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_client_id uuid;
  v_categories text[];
begin
  v_categories := private.normalized_laundry_categories(p_laundry_categories);
  if p_laundry_categories is null
     or cardinality(v_categories) <> cardinality(p_laundry_categories) then
    return json_build_object('error', 'Nieprawidłowe rodzaje prania klienta');
  end if;

  v_result := public.admin_insert_client_with_service_rules(
    p_session_token, p_name, p_route_id, p_mode, p_rules
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  v_client_id := (v_result->>'id')::uuid;
  update public.clients
  set laundry_categories = v_categories
  where id = v_client_id;

  return v_result;
end;
$$;

create or replace function public.admin_update_client_with_service_rules(
  p_session_token text,
  p_id uuid,
  p_name text,
  p_route_id integer,
  p_lat numeric,
  p_lng numeric,
  p_mode text,
  p_rules jsonb,
  p_laundry_categories text[]
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
  v_categories text[];
begin
  v_categories := private.normalized_laundry_categories(p_laundry_categories);
  if p_laundry_categories is null
     or cardinality(v_categories) <> cardinality(p_laundry_categories) then
    return json_build_object('error', 'Nieprawidłowe rodzaje prania klienta');
  end if;

  v_result := public.admin_update_client_with_service_rules(
    p_session_token, p_id, p_name, p_route_id, p_lat, p_lng, p_mode, p_rules
  );
  if v_result->>'error' is not null then
    return v_result;
  end if;

  update public.clients
  set laundry_categories = v_categories
  where id = p_id;

  return v_result;
end;
$$;

revoke execute on function public.admin_insert_client_with_service_rules(
  text, text, integer, text, jsonb, text[]
) from public;
revoke execute on function public.admin_update_client_with_service_rules(
  text, uuid, text, integer, numeric, numeric, text, jsonb, text[]
) from public;

grant execute on function public.admin_insert_client_with_service_rules(
  text, text, integer, text, jsonb, text[]
) to anon, authenticated;
grant execute on function public.admin_update_client_with_service_rules(
  text, uuid, text, integer, numeric, numeric, text, jsonb, text[]
) to anon, authenticated;

create or replace function private.enforce_entry_laundry_category()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_categories text[];
  v_type text := coalesce(new.type, 'P');
begin
  if tg_op = 'UPDATE'
     and new.client_name is not distinct from old.client_name
     and new.type is not distinct from old.type then
    return new;
  end if;

  select client.laundry_categories
  into v_categories
  from public.clients client
  where client.name = new.client_name
    and client.archived_at is null
  limit 1;

  if v_categories is not null and not (v_type = any(v_categories)) then
    raise exception 'Rodzaj prania % jest wyłączony dla klienta %',
      v_type, new.client_name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_entry_laundry_category()
from public, anon, authenticated;

drop trigger if exists entries_enforce_laundry_category on public.entries;
create trigger entries_enforce_laundry_category
before insert or update of client_name, type on public.entries
for each row execute function private.enforce_entry_laundry_category();

commit;
