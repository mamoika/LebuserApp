# Retention Policy - LEBUSER App

Status: operational draft prepared on 2026-06-28. Business/legal approval is
required before automating deletion/anonymization of operational records.

## Principles

- Keep data only as long as needed for logistics, accounting, legal duties,
  security and claims.
- Prefer deactivation/anonymization over hard deletion where history is needed.
- Do not keep manual exports or backups outside approved storage.
- Document exceptions and incident-related holds.
- After approval, convert this policy into database/app cleanup jobs.

## Retention Matrix

| Data category | Default period | Action after period | Automation status | Notes |
| --- | --- | --- | --- | --- |
| Active user accounts | Cooperation/employment period | Keep active only while access is needed | Manual review | Remove access immediately when cooperation ends. |
| Former user accounts | 12 months after deactivation | Deactivate, then anonymize name/login if history can remain | TODO | Add `deactivated_at` before automating. |
| User sessions | 30 days expiry; max 10 regular active sessions/user; impersonation max 8h | Expire/revoke; later delete old revoked rows | Partly implemented | See `../ops/SESSION_PRUNING_POLICY.md`. |
| Session device labels / user agents | Same as session row | Delete with old session rows | TODO cleanup | Used only for admin readability/security. |
| Security/action logs | 24 months | Delete or archive with restricted access | TODO | Keep longer only for disputes/incidents. |
| Breach register | 5 years from closure or longer if dispute requires | Archive securely | Manual | Do not store raw personal data in repo. |
| Route/trip records | 3 years after operational year | Archive/anonymize driver/user identifiers where possible | TODO | Confirm claims/accounting needs. |
| Client route data | Cooperation period + 3 years | Delete/anonymize inactive clients/notes | TODO | Keep active routes while service continues. |
| Laundry receipt / delivery records | 3-6 years depending on accounting relevance | Archive/anonymize where possible | TODO | Confirm with accountant. |
| Cost records | Accounting period, usually 5 years after tax year | Archive/delete according to accounting rules | TODO | Confirm exact period with accountant. |
| Employee schedule/timeline | Employment/cooperation period + legal/claims period | Archive/delete/anonymize | TODO | Confirm labour-law requirements. |
| Frontend error reports | 30-90 days | Auto-delete in provider | Provider setting | If Sentry enabled, configure retention. |
| Supabase managed backups | Provider default, target <= 30-90 days | Automatic expiry | Provider setting | Document actual setting/provider default. |
| Manual database exports | Only for migration/restore/incident need | Delete after purpose, target <= 14 days | Manual | Store encrypted/restricted if retained. |

## Immediate Operational Rules

- Revoke app sessions from Admin -> Sesje when access is no longer needed.
- Remove/deactivate users who leave immediately; do not wait for monthly review.
- Do not create ad hoc spreadsheet/database exports unless there is a defined
  purpose and deletion date.
- If data is under incident/legal hold, record the exception and do not delete
  until released by the business owner.

## Automation Backlog

1. Add `deactivated_at` and `deleted/anonymized_at` fields where appropriate.
2. Add cleanup for old revoked/expired `user_sessions`.
3. Add admin export/delete workflow for data-subject requests.
4. Add anonymization script for old users while preserving operational history.
5. Add archive/anonymization workflow for old route/trip/log records.
6. Add scheduled report listing records past approved retention.

## Review

- Review quarterly.
- Re-approve after adding modules that process new data categories.
- Keep evidence of cleanup runs and exceptions.
