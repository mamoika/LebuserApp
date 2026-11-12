begin;

-- A driver confirms the physical return to the laundry by finishing the course.
-- The existing course-finish trigger records dirty_received_at. Washing is now
-- rejected until that receipt exists, even if a stale client bypasses the UI.
create or replace function public.admin_mark_laundry_washed(
  p_session_token text,
  p_ids text[],
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_count integer;
begin
  select * into v_user
  from public.session_user(p_session_token)
  limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver', 'tunnel', 'packer') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'missing_entries', 'error_code', 'missing_entries');
  end if;

  -- Serialize receipt and wash transitions for the same entries.
  perform 1
  from public.entries entry
  where entry.id = any(p_ids)
    and entry.deleted_at is null
  for update;

  if exists (
    select 1
    from public.entries entry
    where entry.id = any(p_ids)
      and entry.deleted_at is null
      and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
      and entry.dirty_received_at is null
  ) then
    return json_build_object(
      'error', 'laundry_not_at_laundry',
      'error_code', 'laundry_not_at_laundry'
    );
  end if;

  update public.entries
  set washed = true,
      washed_at = now(),
      washed_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      laundry_status = case
        when laundry_ready_at is not null or laundry_packed_at is not null then 'packed'
        else 'washed'
      end
  where id = any(p_ids)
    and deleted_at is null
    and coalesce(done, false) = false;

  get diagnostics v_count = row_count;

  return json_build_object('ok', true, 'affected', v_count);
end;
$$;

revoke execute on function public.admin_mark_laundry_washed(text, text[], text) from public;
grant execute on function public.admin_mark_laundry_washed(text, text[], text) to anon, authenticated;

-- Repair older finished courses that predate the receipt marker. The newest
-- linked finished course is the authoritative return to the laundry.
do $$
declare
  v_entry record;
  v_trolley_no text;
begin
  for v_entry in
    select distinct on (entry.id)
      entry.id,
      entry.client_name,
      entry.arrival_trolley_nos,
      coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) as received_at,
      trip.driver_name,
      trip.id as trip_id
    from public.entries entry
    join public.trip_stop_tasks task on task.entry_id = entry.id
    join public.trip_stops stop on stop.id = task.stop_id
    join public.driver_trips trip on trip.id = stop.trip_id
    where entry.deleted_at is null
      and not coalesce(entry.washed, false)
      and entry.dirty_received_at is null
      and nullif(trim(coalesce(entry.arrival_trolley_nos, '')), '') is not null
      and trip.status = 'finished'
    order by entry.id,
      coalesce(trip.ended_at, trip.started_at, trip.trip_date::timestamptz) desc
  loop
    update public.entries
    set dirty_received_at = v_entry.received_at,
        dirty_received_by = v_entry.driver_name
    where id = v_entry.id
      and dirty_received_at is null;

    for v_trolley_no in
      select distinct trim(value)
      from unnest(string_to_array(v_entry.arrival_trolley_nos, ',')) value
      where nullif(trim(value), '') is not null
    loop
      perform private.record_trolley_event(
        v_trolley_no,
        'dirty_received_at_laundry',
        'returning_to_laundry',
        'dirty_at_laundry',
        'laundry',
        v_entry.client_name,
        v_entry.id,
        null,
        v_entry.driver_name,
        v_entry.received_at,
        jsonb_build_object('trip_id', v_entry.trip_id, 'source', 'receipt_backfill')
      );
    end loop;
  end loop;
end;
$$;

commit;
