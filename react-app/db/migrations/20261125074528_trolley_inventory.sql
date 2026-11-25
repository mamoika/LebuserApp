begin;

create table private.laundry_trolley_inventory (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  started_by text not null,
  trolley_nos text[] not null check (cardinality(trolley_nos) > 0),
  completed_at timestamptz
);

alter table private.laundry_trolley_inventory enable row level security;
revoke all on private.laundry_trolley_inventory from public, anon, authenticated;

create index laundry_trolley_inventory_events_idx
  on public.laundry_trolley_events ((metadata->>'inventory_id'), trolley_no, occurred_at desc)
  where event_type = 'inventory_verified';

-- Use insertion order rather than the effective date of a backdated movement.
create index laundry_trolley_latest_movement_idx
  on public.laundry_trolley_events (trolley_no, created_at desc, id desc)
  where event_type <> 'inventory_verified';

create function private.latest_trolley_movement(p_trolley_no text)
returns uuid
language sql stable
set search_path = ''
as $$
  select event.id
  from public.laundry_trolley_events event
  where event.trolley_no = p_trolley_no
    and event.event_type <> 'inventory_verified'
  order by event.created_at desc, event.id desc
  limit 1
$$;

create function private.trolley_inventory_snapshot()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', inventory.id,
    'started_at', inventory.started_at,
    'completed_at', inventory.completed_at,
    'trolley_nos', inventory.trolley_nos,
    'checks', coalesce((
      select jsonb_object_agg(number.trolley_no, jsonb_build_object(
        'status', verification.to_status,
        'client_name', verification.client_name,
        'verified_at', verification.occurred_at,
        'movement_since_check', (verification.metadata->>'movement_id') is distinct from
          private.latest_trolley_movement(number.trolley_no)::text
      ))
      from unnest(inventory.trolley_nos) as number(trolley_no)
      cross join lateral (
        select event.to_status, event.client_name, event.occurred_at, event.metadata
        from public.laundry_trolley_events event
        where event.trolley_no = number.trolley_no
          and event.event_type = 'inventory_verified'
          and event.metadata->>'inventory_id' = inventory.id::text
        order by event.occurred_at desc
        limit 1
      ) verification
    ), '{}'::jsonb)
  )
  from private.laundry_trolley_inventory inventory
  order by inventory.started_at desc
  limit 1
$$;

-- Keep the existing workflow authorization and payload in one place.
create function public.get_laundry_workflow_with_inventory(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow jsonb;
begin
  v_workflow := public.get_laundry_workflow(p_session_token)::jsonb;
  return v_workflow || jsonb_build_object('trolley_inventory', private.trolley_inventory_snapshot());
end;
$$;

create function public.admin_start_trolley_inventory(p_session_token text, p_previous_inventory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_inventory private.laundry_trolley_inventory;
  v_count integer;
  v_numbers text[];
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role is distinct from 'admin' then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory', 0));
  select * into v_inventory
  from private.laundry_trolley_inventory
  order by started_at desc
  limit 1;

  if v_inventory.id is distinct from p_previous_inventory_id
     or (v_inventory.id is not null and v_inventory.completed_at is null) then
    return private.trolley_inventory_snapshot();
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory-packing', 0));
  v_count := (public.get_laundry_workflow(p_session_token)->>'trolley_count')::integer;
  select array_agg(number::text order by number) into v_numbers
  from generate_series(1, v_count) as number
  join public.laundry_trolleys trolley on trolley.trolley_no = number::text and trolley.active;
  if v_numbers is null then
    return jsonb_build_object('error', 'trolley_inventory_no_trolleys');
  end if;

  insert into private.laundry_trolley_inventory (started_by, trolley_nos)
  values (v_user.name, v_numbers);

  return private.trolley_inventory_snapshot();
end;
$$;

create function public.admin_verify_trolley_inventory(
  p_session_token text,
  p_inventory_id uuid,
  p_trolley_no text,
  p_status text,
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_inventory private.laundry_trolley_inventory;
  v_cycle public.laundry_trolley_cycles;
  v_client_name text;
  v_has_arrival boolean;
  v_previous public.laundry_trolley_events;
  v_movement_id uuid;
  v_result json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role is distinct from 'admin' then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trolley-inventory', 0));
  select * into v_inventory
  from private.laundry_trolley_inventory
  order by started_at desc
  limit 1;

  if v_inventory.id is null or v_inventory.id is distinct from p_inventory_id then
    return jsonb_build_object('error', 'trolley_inventory_changed');
  end if;
  if p_trolley_no is null or not (p_trolley_no = any(v_inventory.trolley_nos)) then
    return jsonb_build_object('error', 'trolley_inventory_invalid_number');
  end if;
  if p_status is null or p_status not in ('free_at_laundry', 'at_client', 'in_use', 'dirty_at_laundry') then
    return jsonb_build_object('error', 'trolley_inventory_invalid_status');
  end if;

  if p_status = 'at_client' then
    select client.name into v_client_name
    from public.clients client
    where client.id = p_client_id and client.archived_at is null
    for share;
    if v_client_name is null then
      return jsonb_build_object('error', 'trolley_inventory_invalid_client');
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('physical-trolley|' || p_trolley_no, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('arrival-trolley|' || p_trolley_no, 0));

  select * into v_cycle
  from public.laundry_trolley_cycles cycle
  where lower(cycle.trolley_no) = p_trolley_no
    and cycle.returned_at is null
    and cycle.status not in ('returned', 'canceled')
  limit 1
  for update;

  select exists (
    select 1
    from private.active_arrival_trolley_reservations() reservation
    where lower(reservation.trolley_no) = p_trolley_no
  ) into v_has_arrival;

  -- A completed delivery can release its physical cart. Active orders and
  -- dirty arrivals remain linked even if the observation disagrees with them.
  if v_cycle.status = 'at_client' and not v_has_arrival
     and (p_status = 'free_at_laundry'
          or (p_status = 'at_client' and v_cycle.client_name is distinct from v_client_name))
     and not exists (
       select 1 from public.entries entry
       where entry.id = any(v_cycle.entry_ids)
         and entry.deleted_at is null
         and not (coalesce(entry.delivered, false) or entry.delivered_at is not null)
     ) then
    v_result := public.admin_return_laundry_trolley(p_session_token, v_cycle.id, v_user.name);
    if v_result->>'error' is not null then
      raise exception 'trolley_inventory_correction_failed';
    end if;
    v_cycle := null;
  end if;

  if p_status = 'at_client' and v_cycle.id is null and not v_has_arrival then
    v_result := public.admin_assign_trolley_to_client(p_session_token, p_trolley_no, p_client_id, v_user.name);
    if v_result->>'error' is not null then
      raise exception 'trolley_inventory_correction_failed';
    end if;
  end if;

  v_movement_id := private.latest_trolley_movement(p_trolley_no);
  select * into v_previous
  from public.laundry_trolley_events event
  where event.trolley_no = p_trolley_no
    and event.event_type = 'inventory_verified'
    and event.metadata->>'inventory_id' = v_inventory.id::text
  order by event.occurred_at desc
  limit 1;

  if v_previous.to_status is not distinct from p_status
     and v_previous.client_name is not distinct from v_client_name
     and (v_previous.metadata->>'movement_id') is not distinct from v_movement_id::text then
    return private.trolley_inventory_snapshot();
  end if;

  perform private.record_trolley_event(
    p_trolley_no, 'inventory_verified', v_previous.to_status, p_status,
    case p_status when 'at_client' then 'client' when 'in_use' then 'in_use' else 'laundry' end,
    v_client_name, null, null, v_user.name, clock_timestamp(),
    jsonb_build_object('inventory_id', v_inventory.id, 'movement_id', v_movement_id)
  );

  update private.laundry_trolley_inventory inventory
  set completed_at = clock_timestamp()
  where inventory.id = v_inventory.id and inventory.completed_at is null
    and cardinality(inventory.trolley_nos) = (
      select count(distinct event.trolley_no)
      from public.laundry_trolley_events event
      where event.event_type = 'inventory_verified'
        and event.metadata->>'inventory_id' = inventory.id::text
    );

  return private.trolley_inventory_snapshot();
end;
$$;

create function private.guard_packing_trolley_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inventory private.laundry_trolley_inventory;
  v_check public.laundry_trolley_events;
begin
  if new.load_kind <> 'laundry' or new.status is distinct from 'packed'
     or new.returned_at is not null or new.trolley_no !~ '^[0-9]{1,2}$' then
    return new;
  end if;

  -- Serialize a new packing reservation with starting the count.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('trolley-inventory-packing', 0));
  select * into v_inventory
  from private.laundry_trolley_inventory
  order by started_at desc
  limit 1;
  if v_inventory.id is null or not (new.trolley_no = any(v_inventory.trolley_nos)) then
    return new;
  end if;

  select * into v_check
  from public.laundry_trolley_events event
  where event.trolley_no = new.trolley_no
    and event.event_type = 'inventory_verified'
    and event.metadata->>'inventory_id' = v_inventory.id::text
  order by event.occurred_at desc
  limit 1;

  if v_check.id is null or (
    v_check.to_status <> 'free_at_laundry' and (v_check.metadata->>'movement_id') is not distinct from
      private.latest_trolley_movement(new.trolley_no)::text
  ) then
    raise exception 'trolley_inventory_unavailable';
  end if;
  return new;
end;
$$;

create trigger guard_packing_trolley_inventory
before insert on public.laundry_trolley_cycles
for each row execute function private.guard_packing_trolley_inventory();

revoke all on function private.latest_trolley_movement(text), private.trolley_inventory_snapshot()
  from public, anon, authenticated;
revoke all on function private.guard_packing_trolley_inventory() from public, anon, authenticated;
revoke all on function public.get_laundry_workflow_with_inventory(text),
  public.admin_start_trolley_inventory(text, uuid),
  public.admin_verify_trolley_inventory(text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_laundry_workflow_with_inventory(text),
  public.admin_start_trolley_inventory(text, uuid),
  public.admin_verify_trolley_inventory(text, uuid, text, text, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
