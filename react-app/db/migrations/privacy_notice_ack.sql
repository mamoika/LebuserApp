-- ============================================================
--  Privacy notice acknowledgement.
--
--  Stores that a user has confirmed they have read the current privacy
--  information. This is an acknowledgement, not a universal consent.
-- ============================================================

alter table public.users
  add column if not exists privacy_notice_ack_at timestamptz,
  add column if not exists privacy_notice_ack_version text;

create or replace function public.acknowledge_privacy_notice(
  p_session_token text,
  p_version text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_version text := nullif(trim(coalesce(p_version, '')), '');
  v_ack_at timestamptz := now();
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_version is null then
    return json_build_object('error', 'Brak wersji informacji RODO');
  end if;

  update public.users
  set
    privacy_notice_ack_at = v_ack_at,
    privacy_notice_ack_version = v_version
  where id = v_user.id;

  return json_build_object(
    'ok', true,
    'privacy_notice_ack_at', v_ack_at,
    'privacy_notice_ack_version', v_version
  );
end;
$$;

drop function if exists public.login_user(text, text);
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
begin
  select id, username, name, role, routes, password_hash,
         privacy_notice_ack_at, privacy_notice_ack_version
  into v_user
  from public.users
  where username = lower(trim(p_username));

  if v_user.id is null then
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  if v_user.password_hash is null then
    return json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  end if;

  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

drop function if exists public.get_all_users(text);
create or replace function public.get_all_users(p_session_token text)
returns table(
  id uuid,
  username text,
  name text,
  role text,
  routes text,
  created_at timestamptz,
  has_password boolean,
  privacy_notice_ack_at timestamptz,
  privacy_notice_ack_version text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_admin(p_session_token);

  return query
  select u.id, u.username, u.name, u.role, u.routes, u.created_at,
         (u.password_hash is not null) as has_password,
         u.privacy_notice_ack_at,
         u.privacy_notice_ack_version
  from public.users u
  order by u.created_at;
end;
$$;

drop function if exists public.admin_impersonate_user(text, uuid);
create or replace function public.admin_impersonate_user(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
begin
  perform public.require_admin(p_session_token);

  select id, username, name, role, routes, password_hash is not null as has_password,
         privacy_notice_ack_at, privacy_notice_ack_version
  into v_user
  from public.users
  where id = p_user_id;

  if v_user.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'has_password', v_user.has_password,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

grant execute on function public.acknowledge_privacy_notice(text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.get_all_users(text) to anon, authenticated;
grant execute on function public.admin_impersonate_user(text, uuid) to anon, authenticated;
