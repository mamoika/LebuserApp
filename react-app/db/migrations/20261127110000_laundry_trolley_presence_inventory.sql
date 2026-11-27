begin;

alter table private.laundry_trolley_inventory
  add column expected_trolley_nos text[];

create index laundry_trolley_presence_round_idx
  on public.laundry_trolley_events ((metadata->>'inventory_id'), trolley_no, occurred_at desc, id desc)
  where event_type in ('inventory_present', 'inventory_missing');

create or replace function private.latest_trolley_movement(p_trolley_no text)
returns uuid
language sql stable
set search_path = ''
as $$
  select event.id
  from public.laundry_trolley_events event
  where event.trolley_no = p_trolley_no
    and event.event_type not in ('inventory_verified', 'inventory_present', 'inventory_missing')
  order by event.created_at desc, event.id desc
  limit 1
$$;

create function private.trolley_inventory_location(p_trolley_no text)
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select case when cycle.status = 'packed' and cycle.released_at is null then 'laundry' else 'away' end
     from public.laundry_trolley_cycles cycle
     where lower(cycle.trolley_no) = p_trolley_no and cycle.returned_at is null
       and cycle.status not in ('returned', 'canceled')
     limit 1),
    (select case when bool_or(entry.dirty_received_at is not null) then 'laundry' else 'away' end
     from private.active_arrival_trolley_reservations() reservation
     join public.entries entry on entry.id = reservation.entry_id
     where lower(reservation.trolley_no) = p_trolley_no
     having count(*) > 0),
    (select case
         when event.to_status in ('present_at_laundry', 'free_at_laundry', 'packed_at_laundry', 'dirty_at_laundry') then 'laundry'
         when event.location_type in ('client', 'vehicle') then 'away'
         else 'unknown'
       end
     from public.laundry_trolley_events event
     where lower(event.trolley_no) = p_trolley_no and event.event_type <> 'inventory_missing'
     order by event.created_at desc, event.occurred_at desc, event.id desc
     limit 1),
    'unknown'
  )
$$;

create function private.trolley_inventory_on_hold(p_trolley_no text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select event.event_type, event.created_at
      from public.laundry_trolley_events event
      where lower(event.trolley_no) = p_trolley_no
        and event.event_type in ('inventory_present', 'inventory_missing')
      order by event.occurred_at desc, event.id desc
      limit 1
    ) observation
    where observation.event_type = 'inventory_missing'
      and not exists (
        select 1 from public.laundry_trolley_events movement
        where lower(movement.trolley_no) = p_trolley_no and movement.created_at > observation.created_at
          and movement.event_type in ('returned_to_laundry', 'dirty_received_at_laundry', 'released_after_wash')
      )
  )
$$;

create function private.trolley_inventory_expected_here(p_numbers text[])
returns text[]
language sql stable
set search_path = ''
as $$
  select array(
    select number from unnest(p_numbers) number
    where private.trolley_inventory_location(number) <> 'away'
  )
$$;

create or replace function private.trolley_inventory_snapshot()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', inventory.id,
    'started_at', inventory.started_at,
    'completed_at', inventory.completed_at,
    'trolley_nos', inventory.trolley_nos,
    'expected_trolley_nos', case when inventory.expected_trolley_nos is not null then
      case when inventory.completed_at is null then private.trolley_inventory_expected_here(inventory.expected_trolley_nos)
           else inventory.expected_trolley_nos end
    end,
    'checks', coalesce((
      select jsonb_object_agg(verification.trolley_no, jsonb_build_object(
        'status', verification.to_status, 'client_name', verification.client_name,
        'verified_at', verification.occurred_at,
        'movement_since_check', (verification.metadata->>'movement_id') is distinct from
          private.latest_trolley_movement(verification.trolley_no)::text
      ))
      from (
        select distinct on (event.trolley_no) event.*
        from public.laundry_trolley_events event
        where event.event_type = 'inventory_verified' and event.metadata->>'inventory_id' = inventory.id::text
        order by event.trolley_no, event.occurred_at desc, event.id desc
      ) verification
    ), '{}'::jsonb),
    'observations', coalesce((
      select jsonb_object_agg(observation.trolley_no, jsonb_build_object(
        'status', case observation.event_type when 'inventory_present' then 'present' else 'missing' end,
        'observed_at', observation.occurred_at, 'actor_name', observation.actor_name,
        'movement_since_check', (observation.metadata->>'movement_id') is distinct from
          private.latest_trolley_movement(observation.trolley_no)::text
      ))
      from (
        select distinct on (event.trolley_no) event.*
        from public.laundry_trolley_events event
        where event.event_type in ('inventory_present', 'inventory_missing')
          and event.metadata->>'inventory_id' = inventory.id::text
        order by event.trolley_no, event.occurred_at desc, event.id desc
      ) observation
    ), '{}'::jsonb),
    'last_seen_at', coalesce((
      select jsonb_object_agg(number, (
        select max(event.occurred_at) from public.laundry_trolley_events event
        where lower(event.trolley_no) = number and (
          event.event_type = 'inventory_present'
          or (event.event_type = 'inventory_verified' and event.to_status in ('free_at_laundry', 'dirty_at_laundry'))
        )
      ))
      from unnest(inventory.trolley_nos) number
    ), '{}'::jsonb),
    'packing_holds', array(
      select number from unnest(inventory.trolley_nos) number
      where private.trolley_inventory_on_hold(number)
    )
  )
  from private.laundry_trolley_inventory inventory
  order by inventory.started_at desc, inventory.id desc
  limit 1
$$;

create function private.require_trolley_inventory_editor(p_session_token text)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer')
     or coalesce(private.user_module_access(v_user.id, 'wash'), 0) < 2 then
    raise exception 'Laundry edit access required' using errcode = '42501';
  end if;
  return v_user.name;
end;
$$;

create or replace function public.admin_start_trolley_inventory(p_session_token text, p_previous_inventory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_trolley_inventory_editor(p_session_token);
  v_inventory private.laundry_trolley_inventory;
  v_count integer;
  v_numbers text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory', 0));
  select * into v_inventory from private.laundry_trolley_inventory order by started_at desc, id desc limit 1;
  if v_inventory.id is distinct from p_previous_inventory_id
     or (v_inventory.expected_trolley_nos is not null and v_inventory.completed_at is null) then
    return private.trolley_inventory_snapshot();
  end if;

  v_count := (public.get_laundry_workflow(p_session_token)->>'trolley_count')::integer;
  select array_agg(number::text order by number) into v_numbers
  from generate_series(1, v_count) number
  join public.laundry_trolleys trolley on trolley.trolley_no = number::text and trolley.active;
  if v_numbers is null then
    return jsonb_build_object('error', 'trolley_inventory_no_trolleys');
  end if;

  -- A previously started whole-fleet count remains in the history.
  update private.laundry_trolley_inventory
  set completed_at = clock_timestamp()
  where id = v_inventory.id and completed_at is null;

  insert into private.laundry_trolley_inventory (started_by, trolley_nos, expected_trolley_nos)
  values (v_actor, v_numbers, array(
    select number from unnest(v_numbers) number where private.trolley_inventory_location(number) = 'laundry'
  ));

  return private.trolley_inventory_snapshot();
end;
$$;

create function public.record_trolley_inventory_observation(
  p_session_token text, p_inventory_id uuid, p_trolley_no text, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_trolley_inventory_editor(p_session_token);
  v_inventory private.laundry_trolley_inventory;
  v_previous_type text;
  v_previous_movement text;
  v_movement_id uuid;
  v_event_type text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory', 0));
  select * into v_inventory from private.laundry_trolley_inventory order by started_at desc, id desc limit 1;
  if v_inventory.id is null or v_inventory.id is distinct from p_inventory_id
     or v_inventory.expected_trolley_nos is null or v_inventory.completed_at is not null then
    return jsonb_build_object('error', 'trolley_inventory_changed');
  end if;
  if p_trolley_no is null or not (p_trolley_no = any(v_inventory.trolley_nos)) then
    return jsonb_build_object('error', 'trolley_inventory_invalid_number');
  end if;
  if p_status is null or p_status not in ('present', 'missing') then
    return jsonb_build_object('error', 'trolley_inventory_invalid_status');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('physical-trolley|' || p_trolley_no, 0));
  if p_status = 'missing' and (
    not (p_trolley_no = any(v_inventory.expected_trolley_nos))
    or private.trolley_inventory_location(p_trolley_no) = 'away'
  ) then
    return jsonb_build_object('error', 'trolley_inventory_not_expected');
  end if;

  v_event_type := case p_status when 'present' then 'inventory_present' else 'inventory_missing' end;
  v_movement_id := private.latest_trolley_movement(p_trolley_no);
  select event.event_type, event.metadata->>'movement_id' into v_previous_type, v_previous_movement
  from public.laundry_trolley_events event
  where event.trolley_no = p_trolley_no and event.metadata->>'inventory_id' = v_inventory.id::text
    and event.event_type in ('inventory_present', 'inventory_missing')
  order by event.occurred_at desc, event.id desc
  limit 1;

  if v_previous_type is distinct from v_event_type
     or (p_status = 'present' and v_previous_movement is distinct from v_movement_id::text)
     or (p_status = 'missing' and not private.trolley_inventory_on_hold(p_trolley_no)) then
    perform private.record_trolley_event(
      p_trolley_no, v_event_type, null,
      case p_status when 'present' then 'present_at_laundry' else 'not_found_at_laundry' end,
      'laundry', null, null, null, v_actor, clock_timestamp(),
      jsonb_build_object('inventory_id', v_inventory.id, 'movement_id', v_movement_id)
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.finish_trolley_inventory(p_session_token text, p_inventory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory private.laundry_trolley_inventory;
begin
  perform private.require_trolley_inventory_editor(p_session_token);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory', 0));
  select * into v_inventory from private.laundry_trolley_inventory order by started_at desc, id desc limit 1;
  if v_inventory.id is null or v_inventory.id is distinct from p_inventory_id or v_inventory.expected_trolley_nos is null then
    return jsonb_build_object('error', 'trolley_inventory_changed');
  end if;

  update private.laundry_trolley_inventory
  set completed_at = clock_timestamp(), expected_trolley_nos = private.trolley_inventory_expected_here(expected_trolley_nos)
  where id = v_inventory.id and completed_at is null;
  return private.trolley_inventory_snapshot();
end;
$$;

create or replace function private.guard_packing_trolley_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trolley_no !~ '^[0-9]{1,2}$' or new.returned_at is not null
     or not (new.status = 'packed' or new.load_kind = 'empty_transfer' and new.status = 'at_client') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('physical-trolley|' || new.trolley_no, 0));
  if private.trolley_inventory_on_hold(new.trolley_no) then
    raise exception 'trolley_inventory_unavailable';
  end if;
  return new;
end;
$$;

revoke all on function private.trolley_inventory_location(text), private.trolley_inventory_on_hold(text),
  private.trolley_inventory_expected_here(text[]), private.require_trolley_inventory_editor(text)
  from public, anon, authenticated;
revoke all on function public.admin_verify_trolley_inventory(text, uuid, text, text, uuid),
  public.record_trolley_inventory_observation(text, uuid, text, text), public.finish_trolley_inventory(text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_trolley_inventory_observation(text, uuid, text, text),
  public.finish_trolley_inventory(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
