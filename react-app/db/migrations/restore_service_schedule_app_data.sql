-- Przywraca reguły dni obsługi w odpowiedzi get_app_data.
-- Tabele client_service_rules i route_service_rules nie zostały usunięte ani
-- zmienione; poprzednia wersja RPC jedynie przestała dołączać je do JSON-a.

begin;

create or replace function public.get_app_data(
  p_session_token text,
  p_last_week_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_last_week_key text := coalesce(
    nullif(trim(coalesce(p_last_week_key, '')), ''),
    to_char((date_trunc('week', now())::date - 7), 'YYYY-MM-DD')
  );
  v_route_ids integer[] := array[]::integer[];
  v_trip_route_ids integer[] := array[]::integer[];
  v_extra_client_names text[] := array[]::text[];
  v_visible_route_ids integer[] := array[]::integer[];
  v_visible_client_names text[] := array[]::text[];
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role = 'driver' then
    v_route_ids := array(
      select distinct trim(x)::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where trim(x) ~ '^[0-9]+$'
    );
    v_trip_route_ids := array(
      select distinct trim(x)::integer
      from public.driver_trips trip
      cross join lateral regexp_split_to_table(coalesce(trip.routes, ''), ',') as x
      where (trip.driver_id = v_user.id or trip.status = 'handover')
        and trip.status in ('planned', 'active', 'handover')
        and trim(x) ~ '^[0-9]+$'
    );
    v_extra_client_names := array(
      select distinct trim(x)
      from public.driver_trips trip
      cross join lateral unnest(public.lebuser_text_jsonb_array(trip.extra_clients)) as x
      where (trip.driver_id = v_user.id or trip.status = 'handover')
        and trip.status in ('planned', 'active', 'handover')
        and nullif(trim(x), '') is not null
    );
    v_visible_route_ids := array(
      select distinct route_id
      from (
        select unnest(v_route_ids) as route_id
        union select unnest(v_trip_route_ids) as route_id
        union select client.route_id
          from public.clients client
          where client.name = any(v_extra_client_names)
      ) visible_routes
      where route_id is not null
    );
    v_visible_client_names := array(
      select distinct client.name
      from public.clients client
      where client.route_id = any(v_visible_route_ids)
         or client.name = any(v_extra_client_names)
    );

    select coalesce(json_agg(row_to_json(client_row)), '[]'::json) into v_clients
    from (
      select client.*,
        coalesce((
          select json_agg(json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          ) order by rule.weekday)
          from public.client_service_rules rule
          where rule.client_id = client.id
        ), '[]'::json) as service_rules
      from public.clients client
      where client.archived_at is null
        and client.name = any(v_visible_client_names)
      order by client.sort_order
    ) client_row;

    select coalesce(json_agg(row_to_json(route_row)), '[]'::json) into v_routes
    from (
      select route.*,
        coalesce((
          select json_agg(json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          ) order by rule.weekday)
          from public.route_service_rules rule
          where rule.route_id = route.id
        ), '[]'::json) as service_rules
      from public.routes route
      where route.id = any(v_visible_route_ids)
      order by route.sort_order
    ) route_row;

    select coalesce(json_agg(row_to_json(entry_row)), '[]'::json) into v_entries
    from (
      select * from public.entries
      where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
        and (route_id = any(v_visible_route_ids)
          or client_name = any(v_visible_client_names)
          or picked_by = v_user.name
          or delivered_by = v_user.name
          or added_by = v_user.name)
    ) entry_row;

    if to_regclass('public.laundry_receipts') is not null then
      select coalesce(json_agg(row_to_json(receipt_row)), '[]'::json) into v_receipts
      from (
        select * from public.laundry_receipts
        where deleted_at is null
          and client_name = any(v_visible_client_names)
        order by doc_no desc
      ) receipt_row;
    end if;
  else
    select coalesce(json_agg(row_to_json(client_row)), '[]'::json) into v_clients
    from (
      select client.*,
        coalesce((
          select json_agg(json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          ) order by rule.weekday)
          from public.client_service_rules rule
          where rule.client_id = client.id
        ), '[]'::json) as service_rules
      from public.clients client
      where client.archived_at is null
      order by client.sort_order
    ) client_row;

    select coalesce(json_agg(row_to_json(route_row)), '[]'::json) into v_routes
    from (
      select route.*,
        coalesce((
          select json_agg(json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          ) order by rule.weekday)
          from public.route_service_rules rule
          where rule.route_id = route.id
        ), '[]'::json) as service_rules
      from public.routes route
      order by route.sort_order
    ) route_row;

    select coalesce(json_agg(row_to_json(entry_row)), '[]'::json) into v_entries
    from (
      select * from public.entries
      where deleted_at is null
        and (done = false or week_key >= v_last_week_key or pick_week_key >= v_last_week_key)
    ) entry_row;

    if to_regclass('public.laundry_receipts') is not null then
      execute
        'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
         from (
           select * from public.laundry_receipts
           where deleted_at is null
           order by doc_no desc
         ) x'
      into v_receipts;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'clients', v_clients,
    'routes', v_routes,
    'entries', v_entries,
    'receipts', v_receipts
  );
end;
$$;

grant execute on function public.get_app_data(text, text) to anon, authenticated;

commit;
