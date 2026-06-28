-- ============================================================
--  Device labels for custom sessions.
--
--  Stores a short browser-provided device label for admin visibility without
--  exposing tokens or token hashes in the UI.
-- ============================================================

alter table public.user_sessions
  add column if not exists device_label text,
  add column if not exists user_agent text;

create or replace function public.set_session_client_info(
  p_session_token text,
  p_device_label text default null,
  p_user_agent text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_updated integer := 0;
  v_device_label text := nullif(trim(coalesce(p_device_label, '')), '');
  v_user_agent text := nullif(trim(coalesce(p_user_agent, '')), '');
begin
  update public.user_sessions s
  set
    device_label = left(v_device_label, 160),
    user_agent = left(v_user_agent, 512)
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now();
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('error', 'Invalid or expired session');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_session_client_info(text, text, text) to anon, authenticated;

create or replace function public.admin_get_session_details(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sessions json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_sessions
  from (
    select
      s.id,
      s.user_id,
      u.username,
      u.name,
      u.role,
      s.device_label,
      s.created_at,
      s.last_seen_at,
      s.expires_at,
      (s.impersonated_by_user_id is not null) as is_impersonation,
      (s.token_hash = public.session_hash(p_session_token)) as is_current_session,
      s.impersonated_by_user_id,
      admin_user.username as impersonated_by_username,
      admin_user.name as impersonated_by_name
    from public.user_sessions s
    join public.users u on u.id = s.user_id
    left join public.users admin_user on admin_user.id = s.impersonated_by_user_id
    where s.revoked_at is null
      and s.expires_at > now()
    order by
      u.role,
      u.username,
      s.impersonated_by_user_id nulls first,
      coalesce(s.last_seen_at, s.created_at) desc,
      s.created_at desc
  ) x;

  return json_build_object(
    'ok', true,
    'sessions', v_sessions
  );
end;
$$;

grant execute on function public.admin_get_session_details(text) to anon, authenticated;
