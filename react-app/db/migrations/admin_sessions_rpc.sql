-- ============================================================
--  Admin session overview.
--
--  Lets an admin monitor custom app sessions without exposing token hashes.
--  Also exposes a safe manual pruning action using the existing pruning policy.
-- ============================================================

alter table public.user_sessions
  add column if not exists impersonated_by_user_id uuid references public.users(id) on delete cascade;

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
      count(s.id) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null)::integer as active_sessions,
      min(s.created_at) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null) as oldest_active_at,
      max(s.created_at) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null) as newest_active_at,
      max(s.last_seen_at) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null) as last_seen_at,
      max(s.expires_at) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null) as latest_expires_at
    from public.users u
    left join public.user_sessions s on s.user_id = u.id
    group by u.id, u.username, u.name, u.role, u.password_hash
    order by
      count(s.id) filter (where s.revoked_at is null and s.expires_at > now() and s.impersonated_by_user_id is null) desc,
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
