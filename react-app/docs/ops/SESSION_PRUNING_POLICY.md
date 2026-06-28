# Session Pruning Policy

Status: implemented on 2026-06-28.

The app uses custom sessions stored in `public.user_sessions`. To prevent active
sessions from growing without bound, the database now prunes sessions when a new
session is created.

Policy:

- Revoke expired sessions.
- Keep at most 3 active sessions per user.
- New sessions still expire after 30 days.

Implementation:

- Migration: `db/migrations/session_pruning.sql`
- Admin overview/action migration: `db/migrations/admin_sessions_rpc.sql`
- Internal helper: `public.prune_user_sessions(p_user_id, p_keep_active)`
- Login/session creation path: `public.create_user_session(p_user_id)` calls
  the pruning helper before and after inserting a new session.
- Admin panel: `Admin -> Sesje` shows active-session counts and can trigger a
  manual prune without exposing session tokens or token hashes.

Operational note:

- `prune_user_sessions` and `create_user_session` are internal
  `SECURITY DEFINER` functions and are not executable by browser roles.
- If a user logs in from a fourth device/browser, their oldest active session is
  revoked automatically.
