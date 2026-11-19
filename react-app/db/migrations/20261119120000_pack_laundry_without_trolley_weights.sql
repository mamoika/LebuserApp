begin;

create or replace function public.admin_save_laundry_trolleys(
  p_session_token text, p_ids text[], p_trolley_nos text[], p_finish boolean, p_append_to_ready boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_ids text[];
  v_nos text[];
  v_no text;
  v_client text;
  v_result json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer_driver', 'packer', 'tunnel') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  select array_agg(distinct id order by id) into v_ids from unnest(p_ids) id where id is not null;
  select array_agg(distinct lower(trim(no)) order by lower(trim(no))) into v_nos
  from unnest(p_trolley_nos) no where nullif(trim(no), '') is not null;
  if v_ids is null or v_nos is null or cardinality(v_nos) <> cardinality(p_trolley_nos)
     or ('brak' = any(v_nos) and (cardinality(v_nos) <> 1 or p_append_to_ready)) then
    raise exception 'packing_batch_changed';
  end if;

  perform 1 from public.entries entry where entry.id = any(v_ids) order by entry.id for update;
  select min(client_name) into v_client from public.entries where id = any(v_ids) and deleted_at is null;
  if v_client is null
     or (select count(*) from public.entries where id = any(v_ids)) <> cardinality(v_ids)
     or exists (
       select 1 from public.entries entry where entry.id = any(v_ids) and (
         entry.deleted_at is not null or entry.client_name is distinct from v_client
         or not coalesce(entry.washed, false) or coalesce(entry.done, false) or coalesce(entry.delivered, false)
         or entry.picked_at is not null or entry.delivered_at is not null
         or entry.laundry_status in ('released', 'at_client', 'returned')
         or (entry.laundry_ready_at is not null or entry.laundry_packed_at is not null
             or coalesce(entry.laundry_status, '') = 'packed') is distinct from p_append_to_ready
       )
     ) or exists (
       select 1 from public.laundry_trolley_cycles cycle where cycle.entry_ids && v_ids
         and cycle.returned_at is null and cycle.status in ('released', 'at_client')
     ) then
    raise exception 'packing_batch_changed';
  end if;

  foreach v_no in array v_nos loop
    if v_no <> 'brak' then
      perform pg_advisory_xact_lock(hashtextextended('physical-trolley|' || v_no, 0));
      perform pg_advisory_xact_lock(hashtextextended('arrival-trolley|' || v_no, 0));
      if not exists (select 1 from public.laundry_trolleys trolley where trolley.trolley_no = v_no and trolley.active)
         or exists (select 1 from private.active_laundry_trolley_cycle(v_no))
         or exists (select 1 from private.active_arrival_trolley_reservations() reservation
                    where lower(reservation.trolley_no) = v_no) then
        raise exception 'packing_batch_changed';
      end if;
    elsif exists (
      select 1 from public.laundry_trolley_cycles cycle
      where cycle.trolley_no = 'brak' and cycle.status <> 'canceled' and cycle.entry_ids @> v_ids
    ) then
      continue;
    end if;

    -- Weight belongs to the laundry entries. Trolley cycles track physical movement.
    insert into public.laundry_trolley_cycles (
      trolley_no, client_name, entry_ids, total_kg, status, load_kind, packed_by, returned_at
    ) values (
      v_no, v_client, v_ids, 0, case when v_no = 'brak' then 'returned' else 'packed' end,
      'laundry', v_user.name, case when v_no = 'brak' then now() end
    );
  end loop;

  if p_append_to_ready then
    update public.entries entry
    set laundry_trolley_no = linked.numbers,
        laundry_trolley_cycle_id = linked.cycle_id
    from (
      select e.id, string_agg(distinct cycle.trolley_no, ', ' order by cycle.trolley_no) as numbers,
             (array_agg(cycle.id order by cycle.packed_at desc, cycle.id))[1] as cycle_id
      from public.entries e join public.laundry_trolley_cycles cycle on e.id = any(cycle.entry_ids)
      where e.id = any(v_ids) and cycle.client_name = v_client and cycle.returned_at is null
        and cycle.status = 'packed' and cycle.load_kind is distinct from 'empty_transfer'
      group by e.id
    ) linked
    where entry.id = linked.id;
  elsif p_finish then
    v_result := public.admin_finish_laundry_packing(p_session_token, v_ids, v_user.name);
    if v_result->>'error' is not null then raise exception 'packing_batch_changed'; end if;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.admin_save_laundry_trolleys(text, text[], text[], boolean, boolean) from public;
grant execute on function public.admin_save_laundry_trolleys(text, text[], text[], boolean, boolean) to anon, authenticated;

commit;
