-- ============================================================
--  Magazyn: ZD1, ZD2, własny katalog asortymentu i dziennik ruchów.
--
--  Asortyment nie jest zapisany na sztywno. Użytkownik może dodawać np.
--  "Ręcznik / 50 x 100 cm" lub różne rozmiary prześcieradeł.
--  Stan jest sumą niezmiennych wpisów w warehouse_transaction_lines.
--  URUCHOM w Supabase -> SQL Editor. Migracja jest idempotentna.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  variant text,
  category text,
  unit text not null default 'szt.',
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouse_items_active_name_idx
  on public.warehouse_items (lower(name), lower(coalesce(variant, '')))
  where archived_at is null;

create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  zone text not null check (zone in ('ZD1', 'ZD2')),
  name text not null,
  location_type text not null default 'carton' check (location_type in ('zone', 'carton')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouse_locations_active_name_idx
  on public.warehouse_locations (zone, lower(name))
  where archived_at is null;

create unique index if not exists warehouse_locations_zone_root_idx
  on public.warehouse_locations (zone)
  where location_type = 'zone' and archived_at is null;

create table if not exists public.warehouse_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  movement_type text not null check (movement_type in ('receipt', 'transfer', 'issue', 'adjustment')),
  source_location_id uuid references public.warehouse_locations(id),
  destination_location_id uuid references public.warehouse_locations(id),
  note text,
  created_by uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint warehouse_transaction_different_locations check (
    source_location_id is null
    or destination_location_id is null
    or source_location_id <> destination_location_id
  )
);

alter table public.warehouse_transactions add column if not exists request_id uuid;

create unique index if not exists warehouse_transactions_request_id_idx
  on public.warehouse_transactions (request_id)
  where request_id is not null;

create index if not exists warehouse_transactions_created_idx
  on public.warehouse_transactions (created_at desc);

create index if not exists warehouse_transactions_source_idx
  on public.warehouse_transactions (source_location_id)
  where source_location_id is not null;

create index if not exists warehouse_transactions_destination_idx
  on public.warehouse_transactions (destination_location_id)
  where destination_location_id is not null;

create table if not exists public.warehouse_transaction_lines (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.warehouse_transactions(id) on delete cascade,
  location_id uuid not null references public.warehouse_locations(id),
  item_id uuid not null references public.warehouse_items(id),
  quantity_delta integer not null check (quantity_delta <> 0)
);

create index if not exists warehouse_transaction_lines_location_idx
  on public.warehouse_transaction_lines (location_id, item_id);

create index if not exists warehouse_transaction_lines_transaction_idx
  on public.warehouse_transaction_lines (transaction_id);

create index if not exists warehouse_transaction_lines_item_idx
  on public.warehouse_transaction_lines (item_id);

alter table public.warehouse_items enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.warehouse_transactions enable row level security;
alter table public.warehouse_transaction_lines enable row level security;

revoke all on public.warehouse_items from public, anon, authenticated;
revoke all on public.warehouse_locations from public, anon, authenticated;
revoke all on public.warehouse_transactions from public, anon, authenticated;
revoke all on public.warehouse_transaction_lines from public, anon, authenticated;
revoke all on sequence public.warehouse_transaction_lines_id_seq from public, anon, authenticated;

insert into public.warehouse_items (name, category, sort_order, created_by_name)
select seed.name, seed.category, seed.sort_order, 'System'
from (values
  ('Pościel', 'Pościel', 1),
  ('Prześcieradło', 'Pościel', 2),
  ('Poszwa', 'Pościel', 3),
  ('Poszewka', 'Pościel', 4)
) as seed(name, category, sort_order)
where not exists (
  select 1 from public.warehouse_items i
  where lower(i.name) = lower(seed.name)
    and coalesce(i.variant, '') = ''
    and i.archived_at is null
);

insert into public.warehouse_locations (zone, name, location_type, sort_order, created_by_name)
select 'ZD1', 'ZD1', 'zone', 0, 'System'
where not exists (
  select 1 from public.warehouse_locations
  where zone = 'ZD1' and location_type = 'zone' and archived_at is null
);

insert into public.warehouse_locations (zone, name, location_type, sort_order, created_by_name)
select 'ZD2', 'ZD2', 'zone', 0, 'System'
where not exists (
  select 1 from public.warehouse_locations
  where zone = 'ZD2' and location_type = 'zone' and archived_at is null
);

insert into public.warehouse_locations (zone, name, location_type, sort_order, created_by_name)
select 'ZD2', 'Karton 1', 'carton', 1, 'System'
where not exists (
  select 1 from public.warehouse_locations
  where zone = 'ZD2' and lower(name) = 'karton 1' and archived_at is null
);

insert into public.warehouse_locations (zone, name, location_type, sort_order, created_by_name)
select 'ZD2', 'Karton 2', 'carton', 2, 'System'
where not exists (
  select 1 from public.warehouse_locations
  where zone = 'ZD2' and lower(name) = 'karton 2' and archived_at is null
);

create or replace function public.get_warehouse_inventory(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_items json;
  v_locations json;
  v_transactions json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Warehouse session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x) order by x.sort_order, x.name, x.variant), '[]'::json)
  into v_items
  from (
    select id, name, variant, category, unit, sort_order
    from public.warehouse_items
    where archived_at is null
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.zone, x.sort_order, x.name), '[]'::json)
  into v_locations
  from (
    select
      l.id,
      l.zone,
      l.name,
      l.location_type,
      l.sort_order,
      coalesce((
        select jsonb_object_agg(stock.item_id::text, stock.quantity)
        from (
          select tl.item_id, sum(tl.quantity_delta)::integer as quantity
          from public.warehouse_transaction_lines tl
          where tl.location_id = l.id
          group by tl.item_id
        ) stock
      ), '{}'::jsonb) as stock
    from public.warehouse_locations l
    where l.archived_at is null
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v_transactions
  from (
    select
      t.id,
      t.movement_type,
      t.source_location_id,
      source.name as source_name,
      source.zone as source_zone,
      t.destination_location_id,
      destination.name as destination_name,
      destination.zone as destination_zone,
      case when t.movement_type = 'adjustment' then (
        select l.name
        from public.warehouse_transaction_lines tl
        join public.warehouse_locations l on l.id = tl.location_id
        where tl.transaction_id = t.id
        limit 1
      ) end as adjustment_location_name,
      case when t.movement_type = 'adjustment' then (
        select l.zone
        from public.warehouse_transaction_lines tl
        join public.warehouse_locations l on l.id = tl.location_id
        where tl.transaction_id = t.id
        limit 1
      ) end as adjustment_zone,
      t.note,
      t.created_by_name,
      t.created_at,
      coalesce((
        select json_agg(json_build_object(
          'item_id', grouped.item_id,
          'item_name', grouped.item_name,
          'item_variant', grouped.item_variant,
          'quantity', grouped.quantity,
          'signed_quantity', grouped.signed_quantity
        ) order by grouped.item_name, grouped.item_variant)
        from (
          select
            tl.item_id,
            i.name as item_name,
            i.variant as item_variant,
            max(abs(tl.quantity_delta))::integer as quantity,
            case when t.movement_type = 'adjustment'
              then sum(tl.quantity_delta)::integer
              else max(abs(tl.quantity_delta))::integer
            end as signed_quantity
          from public.warehouse_transaction_lines tl
          join public.warehouse_items i on i.id = tl.item_id
          where tl.transaction_id = t.id
          group by tl.item_id, i.name, i.variant
        ) grouped
      ), '[]'::json) as lines
    from public.warehouse_transactions t
    left join public.warehouse_locations source on source.id = t.source_location_id
    left join public.warehouse_locations destination on destination.id = t.destination_location_id
    order by t.created_at desc
    limit 100
  ) x;

  return json_build_object(
    'ok', true,
    'items', v_items,
    'locations', v_locations,
    'transactions', v_transactions
  );
end;
$$;

create or replace function public.admin_save_warehouse_item(
  p_session_token text,
  p_item_id uuid,
  p_name text,
  p_variant text default null,
  p_category text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_variant text := nullif(trim(coalesce(p_variant, '')), '');
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_next integer;
  v_item public.warehouse_items;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;
  if v_name is null then
    return json_build_object('error', 'Podaj nazwę asortymentu');
  end if;
  if char_length(v_name) > 80 or char_length(coalesce(v_variant, '')) > 80 then
    return json_build_object('error', 'Nazwa i wariant mogą mieć maksymalnie 80 znaków');
  end if;
  if exists (
    select 1 from public.warehouse_items
    where lower(name) = lower(v_name)
      and lower(coalesce(variant, '')) = lower(coalesce(v_variant, ''))
      and archived_at is null
      and id is distinct from p_item_id
  ) then
    return json_build_object('error', 'Taki asortyment i rozmiar już istnieją');
  end if;

  if p_item_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next from public.warehouse_items;
    insert into public.warehouse_items (
      name, variant, category, sort_order, created_by, created_by_name
    ) values (
      v_name, v_variant, v_category, v_next, v_user.id, v_user.name
    ) returning * into v_item;
  else
    update public.warehouse_items
    set name = v_name,
        variant = v_variant,
        category = v_category,
        updated_at = now()
    where id = p_item_id and archived_at is null
    returning * into v_item;
    if v_item.id is null then
      return json_build_object('error', 'Nie znaleziono asortymentu');
    end if;
  end if;
  return json_build_object('ok', true, 'item', row_to_json(v_item));
end;
$$;

create or replace function public.admin_archive_warehouse_item(
  p_session_token text,
  p_item_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_stock integer;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;
  select coalesce(sum(quantity_delta), 0)::integer
  into v_stock
  from public.warehouse_transaction_lines
  where item_id = p_item_id;
  if v_stock <> 0 then
    return json_build_object('error', 'Najpierw wyzeruj stan tego asortymentu');
  end if;
  update public.warehouse_items
  set archived_at = now(), updated_at = now()
  where id = p_item_id and archived_at is null;
  if not found then
    return json_build_object('error', 'Nie znaleziono asortymentu');
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_add_warehouse_carton(
  p_session_token text,
  p_zone text,
  p_name text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_zone text := upper(trim(coalesce(p_zone, '')));
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_next integer;
  v_location public.warehouse_locations;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;
  if v_zone not in ('ZD1', 'ZD2') then
    return json_build_object('error', 'Nieprawidłowa strefa');
  end if;
  if v_name is null then
    select coalesce(max(sort_order), 0) + 1 into v_next
    from public.warehouse_locations where zone = v_zone and location_type = 'carton';
    v_name := 'Karton ' || v_next;
  end if;
  if char_length(v_name) > 60 then
    return json_build_object('error', 'Nazwa kartonu może mieć maksymalnie 60 znaków');
  end if;
  if exists (
    select 1 from public.warehouse_locations
    where zone = v_zone and lower(name) = lower(v_name) and archived_at is null
  ) then
    return json_build_object('error', 'W tej strefie istnieje już karton o tej nazwie');
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_next
  from public.warehouse_locations where zone = v_zone;
  insert into public.warehouse_locations (
    zone, name, location_type, sort_order, created_by, created_by_name
  ) values (
    v_zone, v_name, 'carton', v_next, v_user.id, v_user.name
  ) returning * into v_location;
  return json_build_object('ok', true, 'location', row_to_json(v_location));
end;
$$;

create or replace function public.admin_record_warehouse_movement(
  p_session_token text,
  p_request_id uuid,
  p_movement_type text,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_lines jsonb,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_type text := lower(trim(coalesce(p_movement_type, '')));
  v_transaction_id uuid;
  v_line record;
  v_available integer;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;
  if p_request_id is not null and exists (
    select 1 from public.warehouse_transactions where request_id = p_request_id
  ) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;
  if v_type not in ('receipt', 'transfer', 'issue') then
    return json_build_object('error', 'Nieprawidłowy typ ruchu');
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return json_build_object('error', 'Podaj co najmniej jedną ilość');
  end if;
  if (v_type = 'receipt' and (p_source_location_id is not null or p_destination_location_id is null))
     or (v_type = 'issue' and (p_source_location_id is null or p_destination_location_id is not null))
     or (v_type = 'transfer' and (
       p_source_location_id is null or p_destination_location_id is null
       or p_source_location_id = p_destination_location_id
     )) then
    return json_build_object('error', 'Nieprawidłowe źródło lub miejsce docelowe');
  end if;

  perform 1 from public.warehouse_locations
  where id in (p_source_location_id, p_destination_location_id) and archived_at is null
  order by id for update;
  if p_source_location_id is not null and not exists (
    select 1 from public.warehouse_locations where id = p_source_location_id and archived_at is null
  ) then
    return json_build_object('error', 'Nie znaleziono miejsca źródłowego');
  end if;
  if p_destination_location_id is not null and not exists (
    select 1 from public.warehouse_locations where id = p_destination_location_id and archived_at is null
  ) then
    return json_build_object('error', 'Nie znaleziono miejsca docelowego');
  end if;

  for v_line in
    select item_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity integer)
    group by item_id
  loop
    if v_line.item_id is null or not exists (
      select 1 from public.warehouse_items where id = v_line.item_id and archived_at is null
    ) then
      return json_build_object('error', 'Nieprawidłowy asortyment');
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      return json_build_object('error', 'Ilość musi być dodatnią liczbą całkowitą');
    end if;
    if p_source_location_id is not null then
      select coalesce(sum(quantity_delta), 0)::integer into v_available
      from public.warehouse_transaction_lines
      where location_id = p_source_location_id and item_id = v_line.item_id;
      if v_available < v_line.quantity then
        return json_build_object('error', format('Brak wystarczającej ilości. Dostępne: %s', v_available));
      end if;
    end if;
  end loop;

  insert into public.warehouse_transactions (
    request_id, movement_type, source_location_id, destination_location_id,
    note, created_by, created_by_name
  ) values (
    p_request_id, v_type, p_source_location_id, p_destination_location_id,
    nullif(trim(coalesce(p_note, '')), ''), v_user.id, v_user.name
  ) returning id into v_transaction_id;

  for v_line in
    select item_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity integer)
    group by item_id
  loop
    if p_source_location_id is not null then
      insert into public.warehouse_transaction_lines (
        transaction_id, location_id, item_id, quantity_delta
      ) values (v_transaction_id, p_source_location_id, v_line.item_id, -v_line.quantity);
    end if;
    if p_destination_location_id is not null then
      insert into public.warehouse_transaction_lines (
        transaction_id, location_id, item_id, quantity_delta
      ) values (v_transaction_id, p_destination_location_id, v_line.item_id, v_line.quantity);
    end if;
  end loop;
  return json_build_object('ok', true, 'transaction_id', v_transaction_id);
end;
$$;

create or replace function public.admin_set_warehouse_stock(
  p_session_token text,
  p_request_id uuid,
  p_location_id uuid,
  p_counts jsonb,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_transaction_id uuid;
  v_line record;
  v_current integer;
  v_delta integer;
  v_expected integer;
  v_received integer;
  v_changes integer := 0;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Warehouse manager session required' using errcode = '42501';
  end if;
  if p_request_id is not null and exists (
    select 1 from public.warehouse_transactions where request_id = p_request_id
  ) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;
  perform 1 from public.warehouse_locations
  where id = p_location_id and archived_at is null for update;
  if not found then
    return json_build_object('error', 'Nie znaleziono miejsca magazynowego');
  end if;
  if jsonb_typeof(p_counts) <> 'array' then
    return json_build_object('error', 'Podaj policzone stany');
  end if;
  select count(*) into v_expected from public.warehouse_items where archived_at is null;
  select count(distinct item_id) into v_received
  from jsonb_to_recordset(p_counts) as x(item_id uuid, quantity integer);
  if v_received <> v_expected then
    return json_build_object('error', 'Podaj stan każdego aktywnego asortymentu');
  end if;

  insert into public.warehouse_transactions (
    request_id, movement_type, note, created_by, created_by_name
  ) values (
    p_request_id, 'adjustment', nullif(trim(coalesce(p_note, '')), ''), v_user.id, v_user.name
  ) returning id into v_transaction_id;

  for v_line in
    select item_id, quantity
    from jsonb_to_recordset(p_counts) as x(item_id uuid, quantity integer)
  loop
    if v_line.quantity is null or v_line.quantity < 0 or not exists (
      select 1 from public.warehouse_items where id = v_line.item_id and archived_at is null
    ) then
      raise exception 'Każdy stan musi być nieujemną liczbą całkowitą';
    end if;
    select coalesce(sum(quantity_delta), 0)::integer into v_current
    from public.warehouse_transaction_lines
    where location_id = p_location_id and item_id = v_line.item_id;
    v_delta := v_line.quantity - v_current;
    if v_delta <> 0 then
      insert into public.warehouse_transaction_lines (
        transaction_id, location_id, item_id, quantity_delta
      ) values (v_transaction_id, p_location_id, v_line.item_id, v_delta);
      v_changes := v_changes + 1;
    end if;
  end loop;
  if v_changes = 0 then
    delete from public.warehouse_transactions where id = v_transaction_id;
    return json_build_object('ok', true, 'unchanged', true);
  end if;
  return json_build_object('ok', true, 'transaction_id', v_transaction_id);
end;
$$;

grant execute on function public.get_warehouse_inventory(text) to anon, authenticated;
grant execute on function public.admin_save_warehouse_item(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_archive_warehouse_item(text, uuid) to anon, authenticated;
grant execute on function public.admin_add_warehouse_carton(text, text, text) to anon, authenticated;
grant execute on function public.admin_record_warehouse_movement(text, uuid, text, uuid, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.admin_set_warehouse_stock(text, uuid, uuid, jsonb, text) to anon, authenticated;
