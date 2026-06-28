# Session Pruning Policy

Status: implemented on 2026-06-28.

The app uses custom sessions stored in `public.user_sessions`. To prevent active
sessions from growing without bound, the database now prunes sessions when a new
session is created.

Policy:

- Revoke expired sessions.
- Keep at most 10 regular active sessions per user.
- New sessions still expire after 30 days.
- Admin "login as user" sessions are marked separately with
  `impersonated_by_user_id`, expire after at most 8 hours, and do not count
  against the user's regular session limit.

Implementation:

- Migration: `db/migrations/session_pruning.sql`
- Update migration: `db/migrations/zz_session_limit_10_impersonation.sql`
- Admin overview/action migration: `db/migrations/admin_sessions_rpc.sql`
- Admin per-session controls: `db/migrations/zz_admin_session_controls_rpc.sql`
- Internal helper: `public.prune_user_sessions(p_user_id, p_keep_active)`
- Login/session creation path: `public.create_user_session(p_user_id)` calls
  the pruning helper before and after inserting a new session.
- Admin panel: `Admin -> Sesje` shows active-session counts and can trigger a
  manual prune without exposing session tokens or token hashes.
- `Admin -> Sesje` also lists active sessions per user and can revoke one
  selected session by session row id. Token hashes are never returned to the
  browser.

Operational note:

- `prune_user_sessions` and `create_user_session` are internal
  `SECURITY DEFINER` functions and are not executable by browser roles.
- If a user logs in from an eleventh device/browser, their oldest regular active session is
  revoked automatically.
- When an admin exits impersonation, the short-lived impersonation session is
  revoked immediately by the frontend.
- The current admin session is protected from individual revoke to avoid
  locking the admin out by accident.
