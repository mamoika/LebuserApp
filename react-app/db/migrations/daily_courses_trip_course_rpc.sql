-- Admin/dispatch: fetch full stop list + tasks for a specific trip (mirrors get_driver_course).
begin;

create or replace function public.get_trip_course(
  p_session_token text,
  p_trip_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_stops json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;

  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono kursu'); end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver')
     and v_trip.driver_id is distinct from v_user.id then
    raise exception 'Course access denied' using errcode = '42501';
  end if;

  perform private.sync_trip_course(v_trip.id);

  select coalesce(json_agg(row_to_json(stop_row) order by stop_row.position), '[]'::json)
  into v_stops
  from (
    select
      s.*,
      c.lat, c.lng,
      coalesce(receipt.address, '') as address,
      coalesce(tasks.items, '[]'::json) as tasks
    from public.trip_stops s
    left join public.clients c on c.id = s.client_id
    left join lateral (
      select lr.address from public.laundry_receipts lr
      where lr.client_name = s.client_name and lr.deleted_at is null
        and nullif(trim(coalesce(lr.address, '')), '') is not null
      order by lr.created_at desc limit 1
    ) receipt on true
    left join lateral (
      select json_agg(row_to_json(task_row) order by task_row.id) as items
      from (
        select task.*, e.done, e.delivered, e.picked_by, e.delivered_by,
               e.laundry_packed_at, e.laundry_ready_at, e.laundry_trolley_no,
               e.laundry_trolley_cycle_id, e.picked_at, e.delivered_at
        from public.trip_stop_tasks task
        left join public.entries e on e.id = task.entry_id
        where task.stop_id = s.id
      ) task_row
    ) tasks on true
    where s.trip_id = v_trip.id
  ) stop_row;

  return json_build_object('ok', true, 'trip', row_to_json(v_trip), 'stops', v_stops);
end;
$$;

grant execute on function public.get_trip_course(text, uuid) to anon, authenticated;

commit;
