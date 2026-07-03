-- ============================================================
--  Dostawa do klienta: kierowca decyduje o wózku "na miejscu".
--
--  Do tej pory driver_deliver_entries w ogóle nie dotykał
--  laundry_trolley_cycles — status wózka (at_client / returned) mógł
--  ustawić tylko admin/pakowacz ręcznie w widoku pralni, po fakcie.
--
--  Teraz driver_deliver_entries przyjmuje dodatkowy parametr
--  p_trolley_actions (jsonb), np.:
--    [
--      { "cycle_id": "...", "action": "leave"  },  -- wózek zostaje u klienta
--      { "cycle_id": "...", "action": "return" }    -- wózek wraca z kierowcą
--                                                       (od razu wraca do puli wolnych,
--                                                       tak jak przy p_leave_trolley
--                                                       w driver_pickup_entries)
--    ]
--  "return" jest też używane do zabrania wózka zostawionego wcześniej
--  u tego samego klienta (wymiana) — front wysyła jego cycle_id z akcją
--  "return", nawet jeśli nie jest częścią bieżącej dostawy.
--
--  Każda taka zmiana zapisuje snapshot stanu sprzed zmiany w nowej
--  tabeli laundry_trolley_delivery_events, żeby driver_undo_deliver
--  mógł ją precyzyjnie cofnąć (tylko jeśli nikt inny nie zmienił
--  wózka od tamtej pory — porównujemy aktualny status z tym, który
--  wtedy ustawiliśmy).
--
--  URUCHOM w Supabase -> SQL Editor. Idempotentne.
-- ============================================================

begin;

create table if not exists public.laundry_trolley_delivery_events (
  id uuid primary key default gen_random_uuid(),
  entry_ids text[] not null,
  driver_name text not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  changes jsonb not null default '[]'::jsonb
);

create index if not exists laundry_trolley_delivery_events_entry_ids_idx
  on public.laundry_trolley_delivery_events using gin (entry_ids);

create index if not exists laundry_trolley_delivery_events_lookup_idx
  on public.laundry_trolley_delivery_events (driver_name, undone_at);

-- Stara sygnatura (2 argumenty) zastępowana nową (3 argumenty, trzeci z
-- wartością domyślną) — usuwamy jawnie, żeby uniknąć dwuznacznych przeciążeń.
drop function if exists public.driver_deliver_entries(text, text[]);

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
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    delivered    = true,
    delivered_by = v_driver.name,
    delivered_at = now()
  where id = any(p_ids) and picked_by = v_driver.name and done = true and coalesce(delivered, false) = false;

  get diagnostics v_affected = row_count;

  -- 0 tu może znaczyć: nic do zrobienia (już dostarczone) albo brak uprawnień/ids.
  -- Nie traktujemy tego jako błąd — front i tak porównuje affected z liczbą id.
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

      -- Zabezpieczenie: wózek musi istnieć, należeć do tego samego klienta
      -- i nie być już trwale zwrócony/anulowany.
      if v_cycle.id is null
         or v_cycle.client_name is distinct from v_client_name
         or v_cycle.returned_at is not null then
        continue;
      end if;

      -- 'leave' na wózku już zostawionym u klienta nic nie zmienia — pomijamy.
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

-- Cofnij dostawę — jak dawniej, plus precyzyjne cofnięcie zmian wózków
-- zapisanych w laundry_trolley_delivery_events (tylko jeśli status wózka
-- od tamtej pory się nie zmienił, żeby nie nadpisać ręcznej korekty z
-- panelu pralni).
create or replace function public.driver_undo_deliver(
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
  v_event record;
  v_change jsonb;
  v_cycle public.laundry_trolley_cycles;
begin
  select * into v_driver from public.require_driver(p_session_token) limit 1;

  update public.entries set
    delivered    = false,
    delivered_by = null,
    delivered_at = null
  where id = any(p_ids) and delivered_by = v_driver.name;

  get diagnostics v_affected = row_count;

  if v_affected > 0 then
    for v_event in
      select *
      from public.laundry_trolley_delivery_events
      where undone_at is null
        and driver_name = v_driver.name
        and entry_ids && p_ids
      order by created_at desc
    loop
      for v_change in select * from jsonb_array_elements(v_event.changes)
      loop
        select * into v_cycle
        from public.laundry_trolley_cycles
        where id = (v_change->>'cycle_id')::uuid;

        if v_cycle.id is not null and v_cycle.status = (v_change->>'new_status') then
          update public.laundry_trolley_cycles
          set status = v_change->>'prev_status',
              delivered_at = (v_change->>'prev_delivered_at')::timestamptz,
              delivered_by = v_change->>'prev_delivered_by',
              returned_at = (v_change->>'prev_returned_at')::timestamptz,
              returned_by = v_change->>'prev_returned_by',
              updated_at = now()
          where id = v_cycle.id;
        end if;
      end loop;

      update public.laundry_trolley_delivery_events
      set undone_at = now()
      where id = v_event.id;
    end loop;
  end if;

  return json_build_object('ok', true, 'affected', v_affected);
end;
$$;

grant execute on function public.driver_deliver_entries(text, text[], jsonb) to anon, authenticated;
grant execute on function public.driver_undo_deliver(text, text[]) to anon, authenticated;

commit;
