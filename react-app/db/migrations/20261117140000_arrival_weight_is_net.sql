begin;

-- Kierowca/administrator zawsze wpisuje wagę NETTO (sam odejmuje wagę wózków).
-- Aplikacja nie liczy już tary: wpisana waga trafia wprost do entries.weight.
-- arrival_gross_kg / arrival_tare_kg zostają tylko dla starych wpisów (historia);
-- nowe i edytowane wpisy mają w nich NULL.

create or replace function public.admin_insert_entry(
  p_session_token text,
  p_id text,
  p_week_key text,
  p_client_name text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_type text,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false,
  p_added_by text default null,
  p_arrival_trolley_nos text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_resolved json;
  v_trolleys integer;
  v_nos text;
  v_net numeric;
begin
  perform * from public.require_driver(p_session_token);
  if nullif(trim(coalesce(p_id, '')), '') is null then return json_build_object('error', 'Brak id wpisu'); end if;
  if nullif(trim(coalesce(p_client_name, '')), '') is null then return json_build_object('error', 'Brak klienta'); end if;

  v_resolved := public.resolve_arrival_trolleys(p_client_name, p_arrival_trolley_nos, p_added_by);
  if v_resolved->>'error' is not null then return v_resolved; end if;
  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 0));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');
  if v_nos is null and coalesce(p_trolleys, 0) > 0 then v_trolleys := p_trolleys; end if;

  v_net := case when p_weight is null then null else round(greatest(0, p_weight), 2) end;

  insert into public.entries (
    id, week_key, client_name, arr_day, pick_day, pick_week_key,
    weight, arrival_gross_kg, arrival_tare_kg, route_id, type, trolleys,
    arrival_trolley_nos, added_by, urgent
  ) values (
    p_id, p_week_key, p_client_name, p_arr_day, p_pick_day, p_pick_week_key,
    v_net, null, null, p_route_id, coalesce(p_type, 'P'), v_trolleys,
    v_nos, nullif(trim(coalesce(p_added_by, '')), ''), coalesce(p_urgent, false)
  );

  return json_build_object('ok', true, 'id', p_id, 'net_kg', v_net);
end;
$$;

create or replace function public.admin_update_entry(
  p_session_token text,
  p_id text,
  p_client_name text,
  p_type text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false,
  p_arrival_trolley_nos text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_resolved json;
  v_trolleys integer;
  v_nos text;
  v_net numeric;
begin
  select * into v_user from public.require_driver(p_session_token) limit 1;
  v_resolved := public.resolve_arrival_trolleys(p_client_name, p_arrival_trolley_nos, v_user.name);
  if v_resolved->>'error' is not null then return v_resolved; end if;
  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 0));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');
  if v_nos is null and coalesce(p_trolleys, 0) > 0 then v_trolleys := p_trolleys; end if;

  v_net := case when p_weight is null then null else round(greatest(0, p_weight), 2) end;

  update public.entries set
    client_name = p_client_name, type = p_type, arr_day = p_arr_day,
    pick_day = p_pick_day, pick_week_key = p_pick_week_key, route_id = p_route_id,
    weight = v_net, arrival_gross_kg = null, arrival_tare_kg = null,
    trolleys = v_trolleys, arrival_trolley_nos = v_nos,
    urgent = coalesce(p_urgent, false)
  where id = p_id;
  if not found then return json_build_object('error', 'Nie znaleziono wpisu'); end if;

  return json_build_object('ok', true, 'net_kg', v_net);
end;
$$;

commit;
