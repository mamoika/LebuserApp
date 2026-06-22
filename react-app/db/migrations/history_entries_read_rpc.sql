-- ============================================================
--  History entries read through a session-token RPC.
--
--  Moves the HistoryView entries SELECT out of the browser. Admin-like roles
--  keep the current broad history view; driver roles are limited to assigned
--  routes. A driver with no assigned routes receives no rows.
-- ============================================================

create or replace function public.get_history_entries(
  p_session_token text,
  p_limit integer default 1500
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_limit integer := least(greatest(coalesce(p_limit, 1500), 1), 2000);
  v_route_ids integer[];
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role in ('driver', 'admin_viewer_driver') then
    v_route_ids := array(
      select trim(x)::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where trim(x) ~ '^[0-9]+$'
    );

    if coalesce(array_length(v_route_ids, 1), 0) = 0 then
      return json_build_object('ok', true, 'entries', '[]'::json);
    end if;

    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_rows
    from (
      select *
      from public.entries
      where route_id = any(v_route_ids)
      order by added_at desc
      limit v_limit
    ) x;
  else
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    into v_rows
    from (
      select *
      from public.entries
      order by added_at desc
      limit v_limit
    ) x;
  end if;

  return json_build_object('ok', true, 'entries', v_rows);
end;
$$;

grant execute on function public.get_history_entries(text, integer) to anon, authenticated;
