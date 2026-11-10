begin;

create or replace function public.admin_force_release_trolley(
  p_session_token text,
  p_trolley_no text,
  p_action text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_no text := nullif(trim(coalesce(p_trolley_no, '')), '');
  v_action text := lower(trim(coalesce(p_action, '')));
  v_by text;
  v_cycle public.laundry_trolley_cycles;
  v_loose_cycle public.laundry_trolley_cycles;
  v_client_name text;
  v_cycle_count integer := 0;
  v_arrival_count integer := 0;
  v_entry_count integer := 0;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role <> 'admin' then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if v_no is null or lower(v_no) in ('brak', 'bez wózka') then
    return json_build_object('error', 'Wybierz fizyczny numer wózka');
  end if;
  if v_action not in ('force_empty', 'make_loose') then
    return json_build_object('error', 'Nieznana operacja korekty wózka');
  end if;
  if not exists (
    select 1 from public.laundry_trolleys trolley
    where lower(trolley.trolley_no) = lower(v_no) and trolley.active
  ) then
    return json_build_object('error', 'Wózek nie istnieje albo jest wycofany');
  end if;

  v_by := coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name);
  perform pg_advisory_xact_lock(hashtextextended(concat('physical-trolley|', lower(v_no)), 0));
  perform pg_advisory_xact_lock(hashtextextended(concat('arrival-trolley|', lower(v_no)), 0));

  select min(source.client_name) into v_client_name
  from (
    select cycle.client_name
    from public.laundry_trolley_cycles cycle
    where lower(cycle.trolley_no) = lower(v_no)
      and cycle.returned_at is null
      and coalesce(cycle.status, '') <> 'canceled'
    union all
    select entry.client_name
    from private.active_arrival_trolley_reservations() reservation
    join public.entries entry on entry.id = reservation.entry_id
    where lower(reservation.trolley_no) = lower(v_no)
  ) source;

  for v_cycle in
    select cycle.*
    from public.laundry_trolley_cycles cycle
    where lower(cycle.trolley_no) = lower(v_no)
      and cycle.returned_at is null
      and coalesce(cycle.status, '') <> 'canceled'
    for update
  loop
    update public.laundry_trolley_cycles
    set status = 'canceled',
        returned_by = v_by,
        returned_at = now(),
        notes = nullif(concat_ws(
          ' | ', notes,
          case when v_action = 'make_loose'
            then 'korekta: zmieniono na pakowanie bez wózka'
            else 'korekta: wymuszono pusty wózek'
          end
        ), ''),
        updated_at = now()
    where id = v_cycle.id;

    if v_action = 'make_loose' and v_cycle.load_kind = 'laundry' then
      insert into public.laundry_trolley_cycles (
        trolley_no, client_name, entry_ids, total_kg, status, load_kind,
        packed_by, packed_at, released_by, released_at, delivered_by, delivered_at,
        returned_by, returned_at, notes
      ) values (
        'brak', v_cycle.client_name, v_cycle.entry_ids, v_cycle.total_kg,
        'returned', 'laundry', v_cycle.packed_by, v_cycle.packed_at,
        v_cycle.released_by, v_cycle.released_at, v_cycle.delivered_by, v_cycle.delivered_at,
        v_by, now(), nullif(concat_ws(' | ', v_cycle.notes, format('korekta z wózka %s: bez wózka', v_no)), '')
      ) returning * into v_loose_cycle;

      update public.entries entry
      set laundry_trolley_no = coalesce((
            select string_agg(distinct changed.value, ', ' order by changed.value)
            from (
              select case when lower(trim(part.value)) = lower(v_no) then 'brak' else trim(part.value) end as value
              from unnest(string_to_array(coalesce(entry.laundry_trolley_no, v_no), ',')) part(value)
              where nullif(trim(part.value), '') is not null
            ) changed
          ), 'brak'),
          laundry_trolley_cycle_id = case
            when entry.laundry_trolley_cycle_id = v_cycle.id then v_loose_cycle.id
            else entry.laundry_trolley_cycle_id
          end
      where entry.id = any(v_cycle.entry_ids)
        and entry.deleted_at is null;
    else
      perform public.recalculate_laundry_status_for_entries(v_cycle.entry_ids);

      update public.entries entry
      set laundry_trolley_no = (
            select string_agg(distinct trim(part.value), ', ' order by trim(part.value))
            from unnest(string_to_array(coalesce(entry.laundry_trolley_no, ''), ',')) part(value)
            where nullif(trim(part.value), '') is not null
              and lower(trim(part.value)) <> lower(v_no)
          ),
          laundry_trolley_cycle_id = case
            when entry.laundry_trolley_cycle_id = v_cycle.id then null
            else entry.laundry_trolley_cycle_id
          end
      where entry.id = any(v_cycle.entry_ids)
        and entry.deleted_at is null;
    end if;

    v_cycle_count := v_cycle_count + 1;
    v_entry_count := v_entry_count + coalesce(array_length(v_cycle.entry_ids, 1), 0);
  end loop;

  with affected as (
    select entry.id,
      (
        select string_agg(distinct trim(part.value), ', ' order by trim(part.value))
        from unnest(string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')) part(value)
        where nullif(trim(part.value), '') is not null
          and lower(trim(part.value)) <> lower(v_no)
      ) as remaining_nos
    from public.entries entry
    where entry.deleted_at is null
      and not coalesce(entry.washed, false)
      and exists (
        select 1
        from unnest(string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')) part(value)
        where lower(trim(part.value)) = lower(v_no)
      )
  )
  update public.entries entry
  set arrival_trolley_nos = affected.remaining_nos,
      trolleys = case
        when affected.remaining_nos is null then 0
        else cardinality(string_to_array(affected.remaining_nos, ','))
      end
  from affected
  where entry.id = affected.id;
  get diagnostics v_arrival_count = row_count;

  if v_cycle_count = 0 and v_arrival_count = 0 then
    return json_build_object('error', 'Wózek jest już pusty i nie ma aktywnych przypisań');
  end if;

  perform private.record_trolley_event(
    v_no,
    case when v_action = 'make_loose' then 'converted_to_loose' else 'forced_empty' end,
    'occupied', 'free_at_laundry', 'laundry', v_client_name,
    null, null, v_by, now(),
    jsonb_build_object(
      'correction', true,
      'action', v_action,
      'cycles_closed', v_cycle_count,
      'arrival_assignments_removed', v_arrival_count
    )
  );

  return json_build_object(
    'ok', true,
    'trolley_no', v_no,
    'action', v_action,
    'cycles_closed', v_cycle_count,
    'arrival_assignments_removed', v_arrival_count,
    'linked_entries', v_entry_count
  );
end;
$$;

revoke all on function public.admin_force_release_trolley(text, text, text, text) from public;
grant execute on function public.admin_force_release_trolley(text, text, text, text) to anon, authenticated;

commit;
