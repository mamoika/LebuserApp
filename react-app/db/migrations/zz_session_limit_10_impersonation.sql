-- ============================================================
--  Session limit 10 + admin impersonation sessions.
--
--  Regular user logins keep up to 10 active sessions per user.
--  Admin "login as user" creates a short-lived impersonation session that is
--  marked separately and does not count against the user's regular sessions.
-- ============================================================

alter table public.user_sessions
  add column if not exists impersonated_by_user_id uuid references public.users(id) on delete cascade;

create index if not exists user_sessions_real_active_idx
  on public.user_sessions(user_id, created_at desc)
  where revoked_at is null and impersonated_by_user_id is null;

create index if not exists user_sessions_impersonated_by_idx
  on public.user_sessions(impersonated_by_user_id)
  where revoked_at is null and impersonated_by_user_id is not null;

create or replace function public.prune_user_sessions(
  p_user_id uuid default null,
  p_keep_active integer default 10
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_keep integer := greatest(coalesce(p_keep_active, 10), 1);
  v_expired integer := 0;
  v_old_active integer := 0;
begin
  update public.user_sessions s
  set revoked_at = coalesce(s.revoked_at, now())
  where s.revoked_at is null
    and s.expires_at <= now()
    and (p_user_id is null or s.user_id = p_user_id);
  get diagnostics v_expired = row_count;

  with ranked as (
    select
      s.id,
      row_number() over (
        partition by s.user_id
        order by coalesce(s.last_seen_at, s.created_at) desc, s.created_at desc
      ) as rn
    from public.user_sessions s
    where s.revoked_at is null
      and s.expires_at > now()
      and s.impersonated_by_user_id is null
      and (p_user_id is null or s.user_id = p_user_id)
  ), candidates as (
    select id
    from ranked
    where rn > v_keep
  )
  update public.user_sessions s
  set revoked_at = now()
  from candidates c
  where s.id = c.id;
  get diagnostics v_old_active = row_count;

  return json_build_object(
    'ok', true,
    'expired_revoked', v_expired,
    'old_active_revoked', v_old_active,
    'keep_active_per_user', v_keep
  );
end;
$$;

revoke all on function public.prune_user_sessions(uuid, integer) from public, anon, authenticated;

create or replace function public.create_user_session(p_user_id uuid)
returns table(session_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_expires_at timestamptz;
begin
  perform public.prune_user_sessions(p_user_id, 10);

  v_token := gen_random_uuid()::text || '.' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';

  insert into public.user_sessions(user_id, token_hash, expires_at)
  values (p_user_id, public.session_hash(v_token), v_expires_at);

  perform public.prune_user_sessions(p_user_id, 10);

  session_token := v_token;
  expires_at := v_expires_at;
  return next;
end;
$$;

revoke all on function public.create_user_session(uuid) from public, anon, authenticated;

create or replace function public.admin_impersonate_user(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_admin_expires_at timestamptz;
  v_user record;
  v_token text;
  v_expires_at timestamptz;
begin
  v_admin_id := public.require_admin(p_session_token);

  select s.expires_at
  into v_admin_expires_at
  from public.user_sessions s
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  select id, username, name, role, routes, password_hash is not null as has_password,
         privacy_notice_ack_at, privacy_notice_ack_version, language
  into v_user
  from public.users
  where id = p_user_id;

  if v_user.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  update public.user_sessions
  set revoked_at = now()
  where impersonated_by_user_id = v_admin_id
    and revoked_at is null;

  v_token := gen_random_uuid()::text || '.' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := least(coalesce(v_admin_expires_at, now() + interval '8 hours'), now() + interval '8 hours');

  insert into public.user_sessions(user_id, token_hash, expires_at, impersonated_by_user_id)
  values (v_user.id, public.session_hash(v_token), v_expires_at, v_admin_id);

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'language', v_user.language,
    'has_password', v_user.has_password,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_token,
    'session_expires_at', v_expires_at,
    'impersonated_by_user_id', v_admin_id
  );
end;
$$;

grant execute on function public.admin_impersonate_user(text, uuid) to anon, authenticated;

create or replace function public.admin_get_session_overview(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
  v_active_total integer := 0;
  v_impersonation_active_total integer := 0;
  v_revoked_total integer := 0;
  v_expired_unrevoked_total integer := 0;
  v_no_password_total integer := 0;
begin
  perform public.require_admin(p_session_token);

  select count(*) into v_active_total
  from public.user_sessions
  where revoked_at is null
    and expires_at > now()
    and impersonated_by_user_id is null;

  select count(*) into v_impersonation_active_total
  from public.user_sessions
  where revoked_at is null
    and expires_at > now()
    and impersonated_by_user_id is not null;

  select count(*) into v_revoked_total
  from public.user_sessions
  where revoked_at is not null;

  select count(*) into v_expired_unrevoked_total
  from public.user_sessions
  where revoked_at is null
    and expires_at <= now();

  select count(*) into v_no_password_total
  from public.users
  where password_hash is null;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select
      u.id,
      u.username,
      u.name,
      u.role,
      (u.password_hash is not null) as has_password,
      count(s.id) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      )::integer as active_sessions,
      min(s.created_at) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      ) as oldest_active_at,
      max(s.created_at) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      ) as newest_active_at,
      max(s.last_seen_at) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      ) as last_seen_at,
      max(s.expires_at) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      ) as latest_expires_at
    from public.users u
    left join public.user_sessions s on s.user_id = u.id
    group by u.id, u.username, u.name, u.role, u.password_hash
    order by
      count(s.id) filter (
        where s.revoked_at is null
          and s.expires_at > now()
          and s.impersonated_by_user_id is null
      ) desc,
      u.role,
      u.username
  ) x;

  return json_build_object(
    'ok', true,
    'active_total', v_active_total,
    'impersonation_active_total', v_impersonation_active_total,
    'revoked_total', v_revoked_total,
    'expired_unrevoked_total', v_expired_unrevoked_total,
    'no_password_total', v_no_password_total,
    'keep_active_per_user', 10,
    'users', v_rows
  );
end;
$$;

create or replace function public.admin_prune_user_sessions(
  p_session_token text,
  p_keep_active integer default 10
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pruned json;
  v_active_total integer := 0;
begin
  perform public.require_admin(p_session_token);

  v_pruned := public.prune_user_sessions(null, greatest(coalesce(p_keep_active, 10), 1));

  select count(*) into v_active_total
  from public.user_sessions
  where revoked_at is null
    and expires_at > now()
    and impersonated_by_user_id is null;

  return json_build_object(
    'ok', true,
    'pruned', v_pruned,
    'active_total', v_active_total
  );
end;
$$;

grant execute on function public.admin_get_session_overview(text) to anon, authenticated;
grant execute on function public.admin_prune_user_sessions(text, integer) to anon, authenticated;

select public.prune_user_sessions(null, 10);
