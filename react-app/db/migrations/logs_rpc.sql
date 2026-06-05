-- ============================================================
--  Log inserts through session-token RPC.
--
--  Transitional migration: it adds a protected RPC but does not revoke direct
--  insert on public.logs yet. After the frontend uses this function in
--  production, a separate hardening migration can revoke insert on logs from
--  anon/authenticated.
-- ============================================================

create or replace function public.insert_log(
  p_session_token text,
  p_action text,
  p_client_name text default null,
  p_entry_id text default null,
  p_details text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_action, '')), '') is null then
    return json_build_object('error', 'Brak akcji logu');
  end if;

  insert into public.logs (user_name, action, client_name, entry_id, details, created_at)
  values (
    v_user.name,
    trim(p_action),
    nullif(trim(coalesce(p_client_name, '')), ''),
    nullif(trim(coalesce(p_entry_id, '')), ''),
    nullif(trim(coalesce(p_details, '')), ''),
    now()
  );

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.insert_log(text, text, text, text, text) to anon, authenticated;
