-- ============================================================
--  Custom-session pruning.
--
--  Prevent unbounded active session growth by pruning sessions at login:
--    - revoke expired sessions,
--    - keep at most 10 active sessions per user.
--
--  Idempotent. Run in Supabase SQL Editor or through psql as postgres.
-- ============================================================

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

-- Apply the same policy immediately for any sessions already present.
select public.prune_user_sessions(null, 10);
