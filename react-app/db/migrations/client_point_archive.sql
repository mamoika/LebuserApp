-- Archiwum punktów klientów:
-- punkt znika z aktywnych tras, lecz jego wpisy i historia pozostają bez zmian.

begin;

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists clients_active_route_order_idx
  on public.clients (route_id, sort_order)
  where archived_at is null;

create unique index if not exists clients_name_normalized_uidx
  on public.clients (lower(trim(name)));

create or replace function private.client_service_is_due(
  p_client_id uuid,
  p_service_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_client public.clients;
  v_route public.routes;
begin
  select * into v_client from public.clients where id = p_client_id;
  if v_client.id is null
     or v_client.archived_at is not null
     or v_client.service_schedule_mode = 'disabled' then
    return false;
  end if;

  if v_client.service_schedule_mode = 'custom' then
    return exists (
      select 1
      from public.client_service_rules rule
      where rule.client_id = v_client.id
        and private.service_rule_is_due(
          rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
        )
    );
  end if;

  if exists (
    select 1
    from public.route_service_rules
    where route_id = v_client.route_id
  ) then
    return exists (
      select 1
      from public.route_service_rules rule
      where rule.route_id = v_client.route_id
        and private.service_rule_is_due(
          rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
        )
    );
  end if;

  select * into v_route from public.routes where id = v_client.route_id;
  return case coalesce(v_route.schedule, 'other')
    when 'daily' then extract(isodow from p_service_date)::integer between 1 and 5
    when 'mwf' then extract(isodow from p_service_date)::integer in (1, 3, 5)
    when 'tth' then extract(isodow from p_service_date)::integer in (2, 4)
    else false
  end;
end;
$$;

revoke execute on function private.client_service_is_due(
  uuid, date
) from public, anon, authenticated;

create or replace function private.resync_current_service_trips()
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_trip record;
begin
  for v_trip in
    select id
    from public.driver_trips
    where status in ('planned', 'active', 'handover')
      and trip_date >= (now() at time zone 'Europe/Warsaw')::date
  loop
    perform private.sync_trip_course(v_trip.id);
  end loop;
end;
$$;

revoke execute on function private.resync_current_service_trips()
from public, anon, authenticated;

create or replace function public.admin_archive_client(
  p_session_token text,
  p_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin record;
  v_client public.clients;
begin
  select * into v_admin
  from public.require_admin(p_session_token)
  limit 1;

  select * into v_client
  from public.clients
  where id = p_id
  for update;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  if v_client.archived_at is not null then
    return json_build_object('error', 'Punkt jest już w archiwum');
  end if;

  update public.clients
  set archived_at = now(),
      archived_by = v_admin.name
  where id = p_id;

  perform private.resync_current_service_trips();

  return json_build_object('ok', true, 'name', v_client.name);
end;
$$;

create or replace function public.admin_restore_client(
  p_session_token text,
  p_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_client public.clients;
begin
  perform public.require_admin(p_session_token);

  select * into v_client
  from public.clients
  where id = p_id
  for update;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  if v_client.archived_at is null then
    return json_build_object('error', 'Punkt jest już aktywny');
  end if;

  update public.clients
  set archived_at = null,
      archived_by = null
  where id = p_id;

  perform private.resync_current_service_trips();

  return json_build_object('ok', true, 'name', v_client.name);
end;
$$;

create or replace function public.admin_get_archived_clients(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_clients json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(item)), '[]'::json)
  into v_clients
  from (
    select
      client.id,
      client.name,
      client.route_id,
      route.name as route_name,
      client.archived_at,
      client.archived_by
    from public.clients client
    left join public.routes route on route.id = client.route_id
    where client.archived_at is not null
    order by client.archived_at desc, client.name
  ) item;

  return json_build_object('ok', true, 'clients', v_clients);
end;
$$;

grant execute on function public.admin_archive_client(text, uuid)
to anon, authenticated;
grant execute on function public.admin_restore_client(text, uuid)
to anon, authenticated;
grant execute on function public.admin_get_archived_clients(text)
to anon, authenticated;

-- Dane operacyjne aplikacji zawierają tylko aktywne punkty klientów.
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
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user
  from public.session_user(p_session_token)
  limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select coalesce(json_agg(row_to_json(client_row)), '[]'::json)
  into v_clients
  from (
    select client.*,
      coalesce((
        select json_agg(
          json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          )
          order by rule.weekday
        )
        from public.client_service_rules rule
        where rule.client_id = client.id
      ), '[]'::json) as service_rules
    from public.clients client
    where client.archived_at is null
    order by client.sort_order
  ) client_row;

  select coalesce(json_agg(row_to_json(route_row)), '[]'::json)
  into v_routes
  from (
    select route.*,
      coalesce((
        select json_agg(
          json_build_object(
            'id', rule.id,
            'weekday', rule.weekday,
            'interval_weeks', rule.interval_weeks,
            'anchor_week', to_char(rule.anchor_week, 'YYYY-MM-DD')
          )
          order by rule.weekday
        )
        from public.route_service_rules rule
        where rule.route_id = route.id
      ), '[]'::json) as service_rules
    from public.routes route
    order by route.sort_order
  ) route_row;

  select coalesce(json_agg(row_to_json(entry_row)), '[]'::json)
  into v_entries
  from (
    select *
    from public.entries
    where deleted_at is null
      and (
        done = false
        or week_key >= v_last_week_key
        or pick_week_key >= v_last_week_key
      )
  ) entry_row;

  if to_regclass('public.laundry_receipts') is not null then
    execute
      'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
       from (
         select *
         from public.laundry_receipts
         where deleted_at is null
         order by doc_no desc
       ) x'
    into v_receipts;
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

grant execute on function public.get_app_data(text, text)
to anon, authenticated;

commit;
