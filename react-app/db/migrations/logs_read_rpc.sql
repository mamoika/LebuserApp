-- ============================================================
--  Log reads through session-token RPCs.
--
--  This is the first read-hardening step. It removes the need for frontend
--  direct SELECTs against public.logs, while preserving the existing UI:
--   - admins read the paginated audit log,
--   - users read the change history for entries they are allowed to see.
-- ============================================================

create or replace function public.get_logs_page(
  p_session_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows json;
begin
  perform public.require_admin(p_session_token);

  select count(*) into v_total from public.logs;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select id, user_name, action, client_name, entry_id, details, created_at
    from public.logs
    order by created_at desc
    limit v_limit offset v_offset
  ) x;

  return json_build_object('ok', true, 'total', v_total, 'logs', v_rows);
end;
$$;

create or replace function public.get_entry_logs(
  p_session_token text,
  p_entry_id text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_entry record;
  v_route_ids integer[];
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_entry_id, '')), '') is null then
    return json_build_object('error', 'Brak id wpisu');
  end if;

  select id, route_id into v_entry
  from public.entries
  where id = p_entry_id
  limit 1;

  if v_entry.id is null then
    return json_build_object('error', 'Nie znaleziono wpisu');
  end if;

  if v_user.role not in ('admin', 'admin_viewer') then
    v_route_ids := array(
      select nullif(trim(x), '')::integer
      from unnest(string_to_array(coalesce(v_user.routes, ''), ',')) as x
      where nullif(trim(x), '') is not null
    );

    if v_entry.route_id is null or not (v_entry.route_id = any(v_route_ids)) then
      raise exception 'Entry access denied' using errcode = '42501';
    end if;
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select id, user_name, action, client_name, entry_id, details, created_at
    from public.logs
    where entry_id = p_entry_id
    order by created_at asc
  ) x;

  return json_build_object('ok', true, 'logs', v_rows);
end;
$$;

grant execute on function public.get_logs_page(text, integer, integer) to anon, authenticated;
grant execute on function public.get_entry_logs(text, text) to anon, authenticated;
