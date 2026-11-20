create index if not exists entries_laundry_history_washed_at_idx
  on public.entries (washed_at desc)
  where deleted_at is null and washed_at is not null;

create or replace function public.get_laundry_history(
  p_session_token text,
  p_from date,
  p_to date,
  p_client text default '',
  p_before date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_route_ids integer[];
  v_client text := lower(trim(coalesce(p_client, '')));
  v_until date := least(p_to + 1, p_before);
  v_result jsonb;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if coalesce(private.user_module_access(v_user.id, 'wash'), 0) < 1
     or coalesce(private.user_module_access(v_user.id, 'history'), 0) < 1 then
    raise exception 'Laundry history access denied' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid laundry history date range' using errcode = '22023';
  end if;

  if v_user.role in ('driver', 'admin_viewer_driver') then
    v_route_ids := array(
      select trim(route)::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as route
      where trim(route) ~ '^[0-9]+$'
    );
  end if;

  -- Page by whole operational days so a batch cannot be split between pages.
  with matching as (
    select
      entry.id, entry.client_name, entry.route_id, entry.weight, entry.done,
      entry.arr_day, entry.week_key, entry.pick_day, entry.pick_week_key, entry.laundry_planned_date,
      entry.washed_at, entry.washed_by, entry.laundry_ready_at, entry.laundry_packed_at, entry.laundry_packed_by,
      entry.picked_at, entry.picked_by,
      (entry.washed_at at time zone 'Europe/Warsaw')::date as wash_day
    from public.entries entry
    where entry.deleted_at is null
      and entry.washed_at >= (p_from::timestamp at time zone 'Europe/Warsaw')
      and entry.washed_at < (v_until::timestamp at time zone 'Europe/Warsaw')
      and (v_route_ids is null or entry.route_id = any(v_route_ids))
      and (v_client = '' or strpos(lower(entry.client_name), v_client) > 0)
  ),
  days as (
    select distinct wash_day from matching order by wash_day desc limit 8
  ),
  page_days as (
    select wash_day from days order by wash_day desc limit 7
  )
  select jsonb_build_object(
    'entries', coalesce(jsonb_agg(to_jsonb(matching) - 'wash_day' order by matching.washed_at desc, matching.id), '[]'::jsonb),
    'older_than', case when (select count(*) from days) > 7 then (select min(wash_day) from page_days) end
  )
  into v_result
  from matching join page_days using (wash_day);

  return v_result;
end;
$$;

revoke all on function public.get_laundry_history(text, date, date, text, date) from public;
grant execute on function public.get_laundry_history(text, date, date, text, date) to anon, authenticated;
