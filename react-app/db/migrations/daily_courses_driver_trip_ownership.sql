-- Kierowca przypisany do aktywnego kursu może cofać odbiór / dostarczać pranie
-- oznaczone na trip.driver_name (np. po akcji admina), nie tylko gdy picked_by = jego imię z sesji.

begin;

create or replace function public.driver_deliver_entries(
  p_session_token text,
  p_ids text[],
  p_trolley_actions jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver record;
  v_affected integer;
  v_client_name text;
  v_changes jsonb := '[]'::jsonb;
  v_action record;
  v_cycle public.laundry_trolley_cycles;
  v_trip_name text;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  select dt.driver_name into v_trip_name
  from public.driver_trips dt
  where dt.driver_id = v_driver.id and dt.status = 'active'
  order by dt.started_at desc nulls last
  limit 1;

  update public.entries set
    delivered    = true,
    delivered_by = v_driver.name,
    delivered_at = now()
  where id = any(p_ids)
    and done = true
    and coalesce(delivered, false) = false
    and (
      picked_by = v_driver.name
      or (v_trip_name is not null and picked_by = v_trip_name)
    );

  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return json_build_object('ok', true, 'affected', 0);
  end if;

  select min(client_name) into v_client_name
  from public.entries
  where id = any(p_ids);

  if p_trolley_actions is not null and jsonb_typeof(p_trolley_actions) = 'array' and jsonb_array_length(p_trolley_actions) > 0 then
    for v_action in
      select * from jsonb_to_recordset(p_trolley_actions) as x(cycle_id uuid, action text)
    loop
      if v_action.cycle_id is null or v_action.action not in ('leave', 'return') then
        continue;
      end if;

      select * into v_cycle from public.laundry_trolley_cycles where id = v_action.cycle_id;

      if v_cycle.id is null
         or v_cycle.client_name is distinct from v_client_name
         or v_cycle.returned_at is not null then
        continue;
      end if;

      if v_action.action = 'leave' and v_cycle.status = 'at_client' then
        continue;
      end if;

      v_changes := v_changes || jsonb_build_object(
        'cycle_id', v_cycle.id,
        'prev_status', v_cycle.status,
        'prev_delivered_at', v_cycle.delivered_at,
        'prev_delivered_by', v_cycle.delivered_by,
        'prev_returned_at', v_cycle.returned_at,
        'prev_returned_by', v_cycle.returned_by,
        'new_status', case when v_action.action = 'leave' then 'at_client' else 'returned' end
      );

      if v_action.action = 'leave' then
        update public.laundry_trolley_cycles
        set status = 'at_client',
            delivered_at = coalesce(delivered_at, now()),
            delivered_by = coalesce(delivered_by, v_driver.name),
            updated_at = now()
        where id = v_cycle.id;
      else
        update public.laundry_trolley_cycles
        set status = 'returned',
            returned_at = now(),
            returned_by = v_driver.name,
            updated_at = now()
        where id = v_cycle.id;
      end if;
    end loop;

    if jsonb_array_length(v_changes) > 0 then
      insert into public.laundry_trolley_delivery_events (entry_ids, driver_name, changes)
      values (p_ids, v_driver.name, v_changes);
    end if;
  end if;

  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

create or replace function public.driver_undo_pickup(
  p_session_token text,
  p_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_driver record;
  v_affected integer;
  v_trip_name text;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  select dt.driver_name into v_trip_name
  from public.driver_trips dt
  where dt.driver_id = v_driver.id and dt.status = 'active'
  order by dt.started_at desc nulls last
  limit 1;

  update public.entries set
    done           = false,
    picked_by      = null,
    picked_at      = null,
    picked_baskets = null
  where id = any(p_ids)
    and done = true
    and coalesce(delivered, false) = false
    and (
      picked_by = v_driver.name
      or (v_trip_name is not null and picked_by = v_trip_name)
    );

  get diagnostics v_affected = row_count;
  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

grant execute on function public.driver_deliver_entries(text, text[], jsonb) to anon, authenticated;
grant execute on function public.driver_undo_pickup(text, text[]) to anon, authenticated;

commit;
