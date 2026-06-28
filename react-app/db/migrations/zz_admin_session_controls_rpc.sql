-- ============================================================
--  Admin controls for individual active sessions.
--
--  Exposes per-session metadata without token hashes and lets an admin revoke
--  a single active session. The current admin session cannot revoke itself.
-- ============================================================

alter table public.user_sessions
  add column if not exists impersonated_by_user_id uuid references public.users(id) on delete cascade;

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

create or replace function public.admin_revoke_user_session(
  p_session_token text,
  p_user_session_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target record;
begin
  perform public.require_admin(p_session_token);

  select
    s.id,
    s.user_id,
    u.username,
    u.name,
    (s.token_hash = public.session_hash(p_session_token)) as is_current_session
  into v_target
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  where s.id = p_user_session_id
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_target.id is null then
    return json_build_object('error', 'Sesja nie istnieje albo nie jest już aktywna');
  end if;

  if v_target.is_current_session then
    return json_build_object('error', 'Nie można usunąć aktualnej sesji admina');
  end if;

  update public.user_sessions
  set revoked_at = now()
  where id = v_target.id
    and revoked_at is null;

  return json_build_object(
    'ok', true,
    'revoked_session_id', v_target.id,
    'user_id', v_target.user_id,
    'username', v_target.username,
    'name', v_target.name
  );
end;
$$;

grant execute on function public.admin_get_session_details(text) to anon, authenticated;
grant execute on function public.admin_revoke_user_session(text, uuid) to anon, authenticated;
