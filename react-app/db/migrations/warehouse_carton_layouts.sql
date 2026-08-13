-- ============================================================
--  Magazyn wizualny: warstwowy układ stosów wewnątrz kartonu.
--
--  Stan magazynowy nadal wynika wyłącznie z warehouse_transaction_lines.
--  Układ przechowuje pozycję i warstwę, a zapis jest możliwy tylko wtedy,
--  gdy suma wizualnych stosów dokładnie odpowiada stanowi kartonu per klient.
-- ============================================================

begin;

create table if not exists public.warehouse_carton_layouts (
  location_id uuid primary key references public.warehouse_locations(id) on delete cascade,
  version integer not null default 0 check (version >= 0),
  layer_count integer not null default 1 check (layer_count between 1 and 100),
  needs_reconciliation boolean not null default false,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.warehouse_carton_layouts
  add column if not exists layer_count integer not null default 1
  check (layer_count between 1 and 100);

alter table public.warehouse_carton_layouts
  add column if not exists needs_reconciliation boolean not null default false;

create table if not exists public.warehouse_carton_placements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.warehouse_carton_layouts(location_id) on delete cascade,
  client_id uuid not null references public.clients(id),
  item_id uuid not null references public.warehouse_items(id),
  quantity integer not null check (quantity > 0),
  layer_index integer not null default 0 check (layer_index between 0 and 99),
  x numeric(6,3) not null check (x between 0 and 100),
  y numeric(6,3) not null check (y between 0 and 100),
  width numeric(6,3) not null check (width > 0 and width <= 100),
  height numeric(6,3) not null check (height > 0 and height <= 100),
  rotation integer not null default 0 check (rotation in (0, 90)),
  created_at timestamptz not null default now(),
  constraint warehouse_carton_placement_horizontal_bounds check (x + width <= 100),
  constraint warehouse_carton_placement_vertical_bounds check (y + height <= 100)
);

create index if not exists warehouse_carton_placements_location_layer_idx
  on public.warehouse_carton_placements (location_id, layer_index, id);

create index if not exists warehouse_carton_placements_stock_ref_idx
  on public.warehouse_carton_placements (location_id, client_id, item_id);

alter table public.warehouse_carton_layouts enable row level security;
alter table public.warehouse_carton_placements enable row level security;

revoke all on public.warehouse_carton_layouts from public, anon, authenticated;
revoke all on public.warehouse_carton_placements from public, anon, authenticated;

create or replace function public.mark_warehouse_carton_layout_stale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.warehouse_carton_layouts
  set needs_reconciliation = true
  where location_id = new.location_id;
  return new;
end;
$$;

drop trigger if exists warehouse_carton_layout_stock_changed
  on public.warehouse_transaction_lines;
create trigger warehouse_carton_layout_stock_changed
after insert on public.warehouse_transaction_lines
for each row execute function public.mark_warehouse_carton_layout_stale();

create or replace function public.get_warehouse_carton_layout(
  p_session_token text,
  p_location_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_layout public.warehouse_carton_layouts;
  v_placements json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Warehouse session required' using errcode = '42501';
  end if;

  perform 1
  from public.warehouse_locations
  where id = p_location_id
    and location_type = 'carton'
    and archived_at is null;
  if not found then
    raise exception 'Active warehouse carton not found' using errcode = 'P0002';
  end if;

  select * into v_layout
  from public.warehouse_carton_layouts
  where location_id = p_location_id;

  select coalesce(json_agg(row_to_json(placement) order by placement.layer_index, placement.id), '[]'::json)
  into v_placements
  from (
    select
      id,
      client_id,
      item_id,
      quantity,
      layer_index,
      x::float8 as x,
      y::float8 as y,
      width::float8 as width,
      height::float8 as height,
      rotation
    from public.warehouse_carton_placements
    where location_id = p_location_id
  ) placement;

  return json_build_object(
    'ok', true,
    'location_id', p_location_id,
    'version', coalesce(v_layout.version, 0),
    'layer_count', coalesce(v_layout.layer_count, 1),
    'needs_reconciliation', coalesce(v_layout.needs_reconciliation, false),
    'updated_at', v_layout.updated_at,
    'updated_by_name', v_layout.updated_by_name,
    'placements', v_placements
  );
end;
$$;

drop function if exists public.admin_save_warehouse_carton_layout(text, uuid, integer, jsonb);

create or replace function public.admin_save_warehouse_carton_layout(
  p_session_token text,
  p_location_id uuid,
  p_expected_version integer,
  p_layer_count integer,
  p_placements jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_current_version integer;
  v_entry jsonb;
  v_mismatch record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;

  perform 1
  from public.warehouse_locations
  where id = p_location_id
    and location_type = 'carton'
    and archived_at is null
  for update;
  if not found then
    raise exception 'Active warehouse carton not found' using errcode = 'P0002';
  end if;

  if p_placements is null or jsonb_typeof(p_placements) <> 'array' then
    raise exception 'Carton placements must be a JSON array' using errcode = '22023';
  end if;
  if p_layer_count is null or p_layer_count not between 1 and 100 then
    raise exception 'Carton layer count must be between 1 and 100' using errcode = '22023';
  end if;

  select
    line.item_id,
    sum(line.quantity_delta)::integer as quantity
  into v_mismatch
  from public.warehouse_transaction_lines line
  join public.warehouse_transactions transaction on transaction.id = line.transaction_id
  where line.location_id = p_location_id
    and transaction.client_id is null
  group by line.item_id
  having sum(line.quantity_delta) <> 0
  limit 1;

  if v_mismatch.item_id is not null then
    raise exception 'Carton contains stock without a client for item %. Assign it before saving a layout.',
      v_mismatch.item_id
      using errcode = '23514';
  end if;

  for v_entry in select value from jsonb_array_elements(p_placements)
  loop
    if jsonb_typeof(v_entry) <> 'object'
      or coalesce((v_entry->>'quantity')::integer, 0) <= 0
      or coalesce((v_entry->>'layer_index')::integer, -1) not between 0 and 99
      or coalesce((v_entry->>'layer_index')::integer, -1) >= p_layer_count
      or coalesce((v_entry->>'x')::numeric, -1) < 0
      or coalesce((v_entry->>'y')::numeric, -1) < 0
      or coalesce((v_entry->>'width')::numeric, 0) <= 0
      or coalesce((v_entry->>'height')::numeric, 0) <= 0
      or (v_entry->>'x')::numeric + (v_entry->>'width')::numeric > 100
      or (v_entry->>'y')::numeric + (v_entry->>'height')::numeric > 100
      or coalesce((v_entry->>'rotation')::integer, 0) not in (0, 90)
    then
      raise exception 'Invalid carton placement geometry or quantity' using errcode = '22023';
    end if;

    perform 1 from public.clients where id = (v_entry->>'client_id')::uuid;
    if not found then
      raise exception 'Warehouse placement client not found' using errcode = '23503';
    end if;

    perform 1
    from public.warehouse_items
    where id = (v_entry->>'item_id')::uuid
      and archived_at is null;
    if not found then
      raise exception 'Active warehouse placement item not found' using errcode = '23503';
    end if;
  end loop;

  with requested as (
    select
      (entry->>'client_id')::uuid as client_id,
      (entry->>'item_id')::uuid as item_id,
      sum((entry->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_placements) entry
    group by (entry->>'client_id')::uuid, (entry->>'item_id')::uuid
  ),
  actual as (
    select
      transaction.client_id,
      line.item_id,
      sum(line.quantity_delta)::integer as quantity
    from public.warehouse_transaction_lines line
    join public.warehouse_transactions transaction on transaction.id = line.transaction_id
    where line.location_id = p_location_id
      and transaction.client_id is not null
    group by transaction.client_id, line.item_id
    having sum(line.quantity_delta) > 0
  )
  select
    coalesce(actual.client_id, requested.client_id) as client_id,
    coalesce(actual.item_id, requested.item_id) as item_id,
    coalesce(actual.quantity, 0) as actual_quantity,
    coalesce(requested.quantity, 0) as layout_quantity
  into v_mismatch
  from actual
  full join requested using (client_id, item_id)
  where coalesce(actual.quantity, 0) <> coalesce(requested.quantity, 0)
  limit 1;

  if v_mismatch.client_id is not null then
    raise exception 'Carton layout quantity mismatch for client %, item %: stock %, layout %',
      v_mismatch.client_id,
      v_mismatch.item_id,
      v_mismatch.actual_quantity,
      v_mismatch.layout_quantity
      using errcode = '23514';
  end if;

  insert into public.warehouse_carton_layouts (
    location_id, version, layer_count, updated_by, updated_by_name, created_at, updated_at
  ) values (
    p_location_id, 0, p_layer_count, v_user.id, coalesce(v_user.name, 'System'), now(), now()
  )
  on conflict (location_id) do nothing;

  select version into v_current_version
  from public.warehouse_carton_layouts
  where location_id = p_location_id
  for update;

  if v_current_version <> coalesce(p_expected_version, -1) then
    raise exception 'Carton layout was changed by another user. Reload and try again.' using errcode = '40001';
  end if;

  delete from public.warehouse_carton_placements where location_id = p_location_id;

  insert into public.warehouse_carton_placements (
    id,
    location_id,
    client_id,
    item_id,
    quantity,
    layer_index,
    x,
    y,
    width,
    height,
    rotation
  )
  select
    coalesce(nullif(entry->>'id', '')::uuid, gen_random_uuid()),
    p_location_id,
    (entry->>'client_id')::uuid,
    (entry->>'item_id')::uuid,
    (entry->>'quantity')::integer,
    (entry->>'layer_index')::integer,
    (entry->>'x')::numeric,
    (entry->>'y')::numeric,
    (entry->>'width')::numeric,
    (entry->>'height')::numeric,
    coalesce((entry->>'rotation')::integer, 0)
  from jsonb_array_elements(p_placements) entry;

  update public.warehouse_carton_layouts
  set
    version = version + 1,
    layer_count = p_layer_count,
    needs_reconciliation = false,
    updated_by = v_user.id,
    updated_by_name = coalesce(v_user.name, 'System'),
    updated_at = now()
  where location_id = p_location_id
  returning version into v_current_version;

  return json_build_object(
    'ok', true,
    'location_id', p_location_id,
    'version', v_current_version
  );
end;
$$;

revoke all on function public.get_warehouse_carton_layout(text, uuid) from public;
revoke all on function public.admin_save_warehouse_carton_layout(text, uuid, integer, integer, jsonb) from public;
revoke all on function public.mark_warehouse_carton_layout_stale() from public, anon, authenticated;

grant execute on function public.get_warehouse_carton_layout(text, uuid) to anon, authenticated;
grant execute on function public.admin_save_warehouse_carton_layout(text, uuid, integer, integer, jsonb) to anon, authenticated;

commit;
