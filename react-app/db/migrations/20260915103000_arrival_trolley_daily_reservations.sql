begin;

create or replace function private.active_arrival_trolley_reservations(
  p_arrival_date date
)
returns table (trolley_no text, client_name text, entry_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct trim(number.value), entry.client_name, entry.id
  from public.entries entry
  cross join lateral unnest(
    string_to_array(coalesce(entry.arrival_trolley_nos, ''), ',')
  ) as number(value)
  where p_arrival_date is not null
    and nullif(trim(number.value), '') is not null
    and entry.deleted_at is null
    and private.entry_arrival_date(entry.week_key, entry.arr_day) = p_arrival_date
    and not coalesce(entry.washed, false)
    and entry.laundry_ready_at is null
    and entry.laundry_packed_at is null
    and coalesce(entry.laundry_status, 'pending') not in (
      'washed', 'packed', 'released', 'at_client', 'returned'
    )
$$;

revoke all on function private.active_arrival_trolley_reservations(date)
from public, anon, authenticated;

create or replace function public.get_arrival_trolley_reservations(
  p_session_token text,
  p_arrival_date date
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user record;
  v_reservations json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Laundry data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(reservation)), '[]'::json)
  into v_reservations
  from (
    select trolley_no, client_name, entry_id
    from private.active_arrival_trolley_reservations(p_arrival_date)
    order by case when trolley_no ~ '^[0-9]+$' then trolley_no::integer else 2147483647 end,
             trolley_no,
             client_name
  ) reservation;

  return json_build_object(
    'ok', true,
    'arrival_date', p_arrival_date,
    'reservations', v_reservations
  );
end;
$$;

grant execute on function public.get_arrival_trolley_reservations(text, date)
to anon, authenticated;

commit;
