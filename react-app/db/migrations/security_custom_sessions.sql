-- ============================================================
--  Custom sessions for the current non-Supabase-Auth login flow.
--
--  Admin still creates users in public.users, users still set their
--  first password on first login, but admin RPC calls now require a
--  valid admin session token returned by login_user.
--
--  Run this in Supabase SQL Editor, then deploy the matching frontend.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);

create index if not exists user_sessions_user_id_idx on public.user_sessions(user_id);
create index if not exists user_sessions_active_idx on public.user_sessions(token_hash)
  where revoked_at is null;

alter table public.user_sessions enable row level security;

drop policy if exists "no direct session access" on public.user_sessions;
create policy "no direct session access" on public.user_sessions
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.user_sessions from anon, authenticated;

create or replace function public.session_hash(p_session_token text)
returns text
language sql
stable
as $$
  select encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.create_user_session(p_user_id uuid)
returns table(session_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_expires_at timestamptz;
begin
  v_token := gen_random_uuid()::text || '.' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';

  insert into public.user_sessions(user_id, token_hash, expires_at)
  values (p_user_id, public.session_hash(v_token), v_expires_at);

  session_token := v_token;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.session_user(p_session_token text)
returns table(id uuid, username text, name text, role text, routes text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.username, u.name, u.role, u.routes
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  update public.user_sessions s
  set last_seen_at = now()
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now();
end;
$$;

create or replace function public.require_admin(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Admin session required' using errcode = '42501';
  end if;

  return v_user.id;
end;
$$;

create or replace function public.logout_user(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_sessions
  set revoked_at = now()
  where token_hash = public.session_hash(p_session_token)
    and revoked_at is null;

  return json_build_object('ok', true);
end;
$$;

-- Public username check remains available because the current UX needs
-- to know whether the first password should be set.
create or replace function public.check_username(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select id, username, name, role, password_hash is not null as has_password
  into v_user
  from public.users
  where username = lower(trim(p_username));

  if v_user.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  return json_build_object(
    'ok', true,
    'has_password', v_user.has_password,
    'name', v_user.name
  );
end;
$$;

create or replace function public.set_first_password(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select id, password_hash into v_user
  from public.users
  where username = lower(trim(p_username));

  if v_user.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  if v_user.password_hash is not null then
    return json_build_object('error', 'Hasło zostało już ustawione');
  end if;

  if length(trim(p_password)) < 4 then
    return json_build_object('error', 'Hasło musi mieć co najmniej 4 znaki');
  end if;

  update public.users
  set password_hash = crypt(p_password, gen_salt('bf'))
  where id = v_user.id;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_session record;
begin
  select id, username, name, role, routes, password_hash
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
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

drop function if exists public.get_all_users();
create or replace function public.get_all_users(p_session_token text)
returns table(id uuid, username text, name text, role text, routes text, created_at timestamptz, has_password boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  return query
  select u.id, u.username, u.name, u.role, u.routes, u.created_at,
         (u.password_hash is not null) as has_password
  from public.users u
  order by u.created_at;
end;
$$;

drop function if exists public.admin_create_user(text, text, text);
create or replace function public.admin_create_user(p_session_token text, p_username text, p_name text, p_role text default 'driver')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_admin(p_session_token);

  if lower(trim(p_role)) not in ('admin', 'driver', 'viewer') then
    return json_build_object('error', 'Nieprawidłowa rola');
  end if;

  insert into public.users (username, name, role, password_hash)
  values (lower(trim(p_username)), trim(p_name), lower(trim(p_role)), null)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return json_build_object('error', 'Użytkownik o tej nazwie już istnieje');
end;
$$;

drop function if exists public.admin_reset_password(uuid);
create or replace function public.admin_reset_password(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  update public.users set password_hash = null where id = p_user_id;
  if not found then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  update public.user_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;

  return json_build_object('ok', true);
end;
$$;

drop function if exists public.update_user_role(uuid, text);
create or replace function public.update_user_role(p_session_token text, p_user_id uuid, p_role text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  if lower(trim(p_role)) not in ('admin', 'driver', 'viewer') then
    return json_build_object('error', 'Nieprawidłowa rola');
  end if;

  update public.users
  set role = lower(trim(p_role))
  where id = p_user_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  update public.user_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;

  return json_build_object('ok', true);
end;
$$;

drop function if exists public.update_user_routes(uuid, text);
create or replace function public.update_user_routes(p_session_token text, p_user_id uuid, p_routes text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  update public.users
  set routes = nullif(trim(coalesce(p_routes, '')), '')
  where id = p_user_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  return json_build_object('ok', true);
end;
$$;

drop function if exists public.admin_delete_user(uuid);
create or replace function public.admin_delete_user(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin(p_session_token);

  delete from public.users where id = p_user_id;
  if not found then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  return json_build_object('ok', true);
end;
$$;

drop function if exists public.admin_impersonate_user(uuid);
create or replace function public.admin_impersonate_user(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_session record;
begin
  perform public.require_admin(p_session_token);

  select id, username, name, role, routes, password_hash is not null as has_password
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
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

revoke all on function public.session_hash(text) from public;
revoke all on function public.create_user_session(uuid) from public;
revoke all on function public.session_user(text) from public;
revoke all on function public.require_admin(text) from public;

grant execute on function public.check_username(text) to anon, authenticated;
grant execute on function public.set_first_password(text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.logout_user(text) to anon, authenticated;
grant execute on function public.get_all_users(text) to anon, authenticated;
grant execute on function public.admin_create_user(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_reset_password(text, uuid) to anon, authenticated;
grant execute on function public.update_user_role(text, uuid, text) to anon, authenticated;
grant execute on function public.update_user_routes(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, uuid) to anon, authenticated;
grant execute on function public.admin_impersonate_user(text, uuid) to anon, authenticated;
