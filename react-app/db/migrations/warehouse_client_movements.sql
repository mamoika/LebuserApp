-- ============================================================
--  Magazyn według klientów:
--  - każdy ruch kartonowy zachowuje klienta,
--  - wydanie jest kontrolowane na saldzie klienta,
--  - stan "Do rozłożenia" jest wyłącznie ręcznym stanem strefy.
-- ============================================================

begin;

alter table public.warehouse_transactions
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists client_name text;

create index if not exists warehouse_transactions_client_idx
  on public.warehouse_transactions (client_id, created_at desc)
  where client_id is not null;

create or replace function public.get_warehouse_inventory(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_clients json;
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

  select coalesce(json_agg(row_to_json(x) order by x.archived_at nulls first, x.sort_order, x.name), '[]'::json)
  into v_clients
  from (
    select
      c.id,
      c.name,
      c.route_id,
      r.name as route_name,
      c.sort_order,
      c.archived_at
    from public.clients c
    left join public.routes r on r.id = c.route_id
    where c.archived_at is null
       or exists (
         select 1
         from public.warehouse_transactions wt
         join public.warehouse_transaction_lines wtl on wtl.transaction_id = wt.id
         where wt.client_id = c.id
         group by wt.client_id
         having sum(wtl.quantity_delta) > 0
       )
  ) x;

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
      location.id,
      location.zone,
      location.name,
      location.location_type,
      location.sort_order,
      coalesce((
        select jsonb_object_agg(stock.item_id::text, stock.quantity)
        from (
          select line.item_id, sum(line.quantity_delta)::integer as quantity
          from public.warehouse_transaction_lines line
          where line.location_id = location.id
          group by line.item_id
        ) stock
      ), '{}'::jsonb) as stock,
      coalesce((
        select json_agg(
          json_build_object(
            'client_id', client_balance.client_id,
            'client_name', client_balance.client_name,
            'stock', client_balance.stock
          )
          order by client_balance.client_name
        )
        from (
          select
            item_balance.client_id,
            max(item_balance.client_name) as client_name,
            jsonb_object_agg(item_balance.item_id::text, item_balance.quantity) as stock
          from (
            select
              wt.client_id,
              coalesce(max(wt.client_name), max(client.name), 'Nieznany klient') as client_name,
              wtl.item_id,
              sum(wtl.quantity_delta)::integer as quantity
            from public.warehouse_transaction_lines wtl
            join public.warehouse_transactions wt on wt.id = wtl.transaction_id
            left join public.clients client on client.id = wt.client_id
            where wtl.location_id = location.id
              and wt.client_id is not null
            group by wt.client_id, wtl.item_id
            having sum(wtl.quantity_delta) > 0
          ) item_balance
          group by item_balance.client_id
        ) client_balance
      ), '[]'::json) as client_stock
    from public.warehouse_locations location
    where location.archived_at is null
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v_transactions
  from (
    select
      wt.id,
      wt.movement_type,
      wt.client_id,
      coalesce(wt.client_name, client.name) as client_name,
      wt.source_location_id,
      source.name as source_name,
      source.zone as source_zone,
      wt.destination_location_id,
      destination.name as destination_name,
      destination.zone as destination_zone,
      case when wt.movement_type = 'adjustment' then (
        select location.name
        from public.warehouse_transaction_lines line
        join public.warehouse_locations location on location.id = line.location_id
        where line.transaction_id = wt.id
        limit 1
      ) end as adjustment_location_name,
      case when wt.movement_type = 'adjustment' then (
        select location.zone
        from public.warehouse_transaction_lines line
        join public.warehouse_locations location on location.id = line.location_id
        where line.transaction_id = wt.id
        limit 1
      ) end as adjustment_zone,
      wt.note,
      wt.created_by_name,
      wt.created_at,
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
            line.item_id,
            item.name as item_name,
            item.variant as item_variant,
            max(abs(line.quantity_delta))::integer as quantity,
            case when wt.movement_type = 'adjustment'
              then sum(line.quantity_delta)::integer
              else max(abs(line.quantity_delta))::integer
            end as signed_quantity
          from public.warehouse_transaction_lines line
          join public.warehouse_items item on item.id = line.item_id
          where line.transaction_id = wt.id
          group by line.item_id, item.name, item.variant
        ) grouped
      ), '[]'::json) as lines
    from public.warehouse_transactions wt
    left join public.clients client on client.id = wt.client_id
    left join public.warehouse_locations source on source.id = wt.source_location_id
    left join public.warehouse_locations destination on destination.id = wt.destination_location_id
    order by wt.created_at desc
    limit 100
  ) x;

  return json_build_object(
    'ok', true,
    'clients', v_clients,
    'items', v_items,
    'locations', v_locations,
    'transactions', v_transactions
  );
end;
$$;

create or replace function public.admin_record_warehouse_client_movement(
  p_session_token text,
  p_request_id uuid,
  p_movement_type text,
  p_client_id uuid,
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
  v_client public.clients;
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

  select * into v_client from public.clients where id = p_client_id;
  if v_client.id is null then
    return json_build_object('error', 'Wybierz klienta');
  end if;
  if v_type = 'receipt' and v_client.archived_at is not null then
    return json_build_object('error', 'Nie można przyjąć asortymentu dla archiwalnego klienta');
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

  perform 1
  from public.warehouse_locations
  where id in (p_source_location_id, p_destination_location_id)
    and archived_at is null
  order by id
  for update;

  if p_source_location_id is not null and not exists (
    select 1
    from public.warehouse_locations
    where id = p_source_location_id
      and location_type = 'carton'
      and archived_at is null
  ) then
    return json_build_object('error', 'Źródłem ruchu klienta musi być karton');
  end if;
  if p_destination_location_id is not null and not exists (
    select 1
    from public.warehouse_locations
    where id = p_destination_location_id
      and location_type = 'carton'
      and archived_at is null
  ) then
    return json_build_object('error', 'Miejscem docelowym ruchu klienta musi być karton');
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
      select coalesce(sum(line.quantity_delta), 0)::integer
      into v_available
      from public.warehouse_transaction_lines line
      join public.warehouse_transactions wt on wt.id = line.transaction_id
      where line.location_id = p_source_location_id
        and line.item_id = v_line.item_id
        and wt.client_id = p_client_id;

      if v_available < v_line.quantity then
        return json_build_object(
          'error',
          format('Brak wystarczającej ilości dla klienta %s. Dostępne: %s', v_client.name, v_available)
        );
      end if;
    end if;
  end loop;

  insert into public.warehouse_transactions (
    request_id,
    movement_type,
    client_id,
    client_name,
    source_location_id,
    destination_location_id,
    note,
    created_by,
    created_by_name
  ) values (
    p_request_id,
    v_type,
    v_client.id,
    v_client.name,
    p_source_location_id,
    p_destination_location_id,
    nullif(trim(coalesce(p_note, '')), ''),
    v_user.id,
    v_user.name
  )
  returning id into v_transaction_id;

  for v_line in
    select item_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity integer)
    group by item_id
  loop
    if p_source_location_id is not null then
      insert into public.warehouse_transaction_lines (
        transaction_id, location_id, item_id, quantity_delta
      ) values (
        v_transaction_id, p_source_location_id, v_line.item_id, -v_line.quantity
      );
    end if;
    if p_destination_location_id is not null then
      insert into public.warehouse_transaction_lines (
        transaction_id, location_id, item_id, quantity_delta
      ) values (
        v_transaction_id, p_destination_location_id, v_line.item_id, v_line.quantity
      );
    end if;
  end loop;

  return json_build_object('ok', true, 'transaction_id', v_transaction_id);
end;
$$;

create or replace function public.guard_warehouse_adjustment_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.warehouse_transactions wt
    where wt.id = new.transaction_id
      and wt.movement_type = 'adjustment'
  ) and not exists (
    select 1
    from public.warehouse_locations location
    where location.id = new.location_id
      and location.location_type = 'zone'
  ) then
    raise exception 'Stan ręczny można ustawić wyłącznie dla pola Do rozłożenia';
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_adjustment_location_guard
  on public.warehouse_transaction_lines;

create trigger warehouse_adjustment_location_guard
before insert on public.warehouse_transaction_lines
for each row execute function public.guard_warehouse_adjustment_location();

revoke all on function public.guard_warehouse_adjustment_location() from public;
revoke execute on function public.admin_record_warehouse_movement(
  text, uuid, text, uuid, uuid, jsonb, text
) from public, anon, authenticated;
revoke all on function public.admin_record_warehouse_client_movement(
  text, uuid, text, uuid, uuid, uuid, jsonb, text
) from public;
grant execute on function public.admin_record_warehouse_client_movement(
  text, uuid, text, uuid, uuid, uuid, jsonb, text
) to anon, authenticated;

commit;
