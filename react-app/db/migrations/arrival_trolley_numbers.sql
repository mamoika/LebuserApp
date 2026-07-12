-- ============================================================
--  Przyjazd brudnego: numery wózków zamiast samej liczby.
--
--  Dodaje entries.arrival_trolley_nos (np. "3, 7") i przy zapisie
--  zwraca wózki u klienta (status at_client) do puli wolnych.
--
--  URUCHOM w Supabase → SQL Editor. Idempotentne.
-- ============================================================

alter table public.entries add column if not exists arrival_trolley_nos text;

create or replace function public.resolve_arrival_trolleys(
  p_client_name text,
  p_arrival_trolley_nos text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nos text[];
  v_no text;
  v_cycle public.laundry_trolley_cycles;
  v_by text := nullif(trim(coalesce(p_by, '')), '');
begin
  if nullif(trim(coalesce(p_arrival_trolley_nos, '')), '') is null then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  select coalesce(array_agg(distinct trim(x) order by trim(x)), array[]::text[])
  into v_nos
  from unnest(string_to_array(p_arrival_trolley_nos, ',')) as x
  where nullif(trim(x), '') is not null;

  if coalesce(array_length(v_nos, 1), 0) = 0 then
    return json_build_object('ok', true, 'trolleys', 0, 'nos', null);
  end if;

  foreach v_no in array v_nos loop
    select *
    into v_cycle
    from public.laundry_trolley_cycles
    where lower(trolley_no) = lower(v_no)
      and returned_at is null
    limit 1;

    if v_cycle.id is null then
      continue;
    end if;

    if v_cycle.status = 'at_client' then
      if v_cycle.client_name is distinct from p_client_name then
        return json_build_object(
          'error',
          format('Wózek %s jest u klienta: %s', v_no, v_cycle.client_name)
        );
      end if;

      update public.laundry_trolley_cycles
      set status = 'returned',
          returned_by = coalesce(v_by, 'system'),
          returned_at = now(),
          updated_at = now()
      where id = v_cycle.id;

      update public.entries
      set laundry_status = 'returned'
      where id = any(v_cycle.entry_ids);
    elsif v_cycle.status in ('packed', 'released') then
      return json_build_object(
        'error',
        format('Wózek %s jest zajęty na pralni (%s)', v_no, v_cycle.client_name)
      );
    end if;
  end loop;

  return json_build_object(
    'ok', true,
    'trolleys', array_length(v_nos, 1),
    'nos', array_to_string(v_nos, ', ')
  );
end;
$$;

revoke all on function public.resolve_arrival_trolleys(text, text, text) from public;
grant execute on function public.resolve_arrival_trolleys(text, text, text) to anon, authenticated;

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
set search_path = public
as $$
declare
  v_resolved json;
  v_trolleys integer;
  v_nos text;
begin
  perform * from public.require_driver(p_session_token);

  if nullif(trim(coalesce(p_id, '')), '') is null then
    return json_build_object('error', 'Brak id wpisu');
  end if;
  if nullif(trim(coalesce(p_client_name, '')), '') is null then
    return json_build_object('error', 'Brak klienta');
  end if;

  v_resolved := public.resolve_arrival_trolleys(
    p_client_name,
    p_arrival_trolley_nos,
    p_added_by
  );
  if v_resolved->>'error' is not null then
    return v_resolved;
  end if;

  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 1));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');

  if v_nos is null and coalesce(p_trolleys, 0) > 0 and nullif(trim(coalesce(p_arrival_trolley_nos, '')), '') is null then
    v_trolleys := coalesce(p_trolleys, 1);
  end if;

  insert into public.entries
    (id, week_key, client_name, arr_day, pick_day, pick_week_key,
     weight, route_id, type, trolleys, arrival_trolley_nos, added_by, urgent)
  values
    (p_id, p_week_key, p_client_name, p_arr_day, p_pick_day, p_pick_week_key,
     p_weight, p_route_id, coalesce(p_type, 'P'), v_trolleys, v_nos,
     nullif(trim(coalesce(p_added_by, '')), ''), coalesce(p_urgent, false));

  return json_build_object('ok', true, 'id', p_id);
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
set search_path = public
as $$
declare
  v_user record;
  v_resolved json;
  v_trolleys integer;
  v_nos text;
begin
  select * into v_user from public.require_driver(p_session_token) limit 1;

  v_resolved := public.resolve_arrival_trolleys(
    p_client_name,
    p_arrival_trolley_nos,
    v_user.name
  );
  if v_resolved->>'error' is not null then
    return v_resolved;
  end if;

  v_trolleys := coalesce((v_resolved->>'trolleys')::integer, coalesce(p_trolleys, 1));
  v_nos := nullif(trim(coalesce(v_resolved->>'nos', '')), '');

  if v_nos is null and coalesce(p_trolleys, 0) > 0 and nullif(trim(coalesce(p_arrival_trolley_nos, '')), '') is null then
    v_trolleys := coalesce(p_trolleys, 1);
  end if;

  update public.entries set
    client_name = p_client_name,
    type = p_type,
    arr_day = p_arr_day,
    pick_day = p_pick_day,
    pick_week_key = p_pick_week_key,
    route_id = p_route_id,
    weight = p_weight,
    trolleys = v_trolleys,
    arrival_trolley_nos = v_nos,
    urgent = coalesce(p_urgent, false)
  where id = p_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_insert_entry(
  text, text, text, text, integer, integer, text, integer, text, numeric, integer, boolean, text, text
) to anon, authenticated;

grant execute on function public.admin_update_entry(
  text, text, text, text, integer, integer, text, integer, numeric, integer, boolean, text
) to anon, authenticated;
