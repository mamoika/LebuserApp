# Session Revocation - 2026-06-28

Status: completed.

Purpose: clean up old and duplicate custom app sessions after the access review.

## Criteria

Revoked active sessions matching either condition:

- `created_at < now() - interval '7 days'`
- more than 3 active sessions for the same user, keeping the 3 most recent by
  `coalesce(last_seen_at, created_at)` and `created_at`

## Result

- Active sessions before: 126
- Sessions revoked: 110
- Active sessions after: 16
- Total revoked sessions after operation: 149

Remaining active sessions:

| Username | Role | Active sessions |
| --- | --- | ---: |
| `filip` | `driver` | 3 |
| `henryk` | `driver` | 3 |
| `mamoika` | `admin` | 3 |
| `marcin` | `driver` | 3 |
| `muller` | `admin_viewer_driver` | 3 |
| `thomas` | `admin_viewer` | 1 |

Accounts with no remaining active session:

- `oksana`
- `patryk`

Both were already marked as no-password/unclaimed in the access review.

## Follow-Up

- Decide whether unclaimed accounts should be removed, deactivated or claimed
  with a controlled first-password flow.
- Add repeatable session pruning so active sessions do not build up again.
- Consider lowering the custom session lifetime if 30 days is more than the
  business needs.
