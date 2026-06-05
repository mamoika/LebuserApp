# Retention Policy - Draft

Status: draft - business/legal approval required before automation.

## Principles

- Keep data only as long as needed for logistics, accounting, legal obligations,
  security and claims.
- Prefer deactivation/anonymization over hard deletion where records are needed
  for history or accounting.
- Document exceptions.

## Proposed Retention Periods

| Data category | Proposed period | Action after period | Notes |
| --- | --- | --- | --- |
| Active user accounts | employment/cooperation period | deactivate | Remove access immediately after cooperation ends. |
| Former user accounts | 12 months after deactivation | anonymize name/login where possible | Keep action history if needed for audit. |
| User sessions | 30-45 days max | delete expired/revoked sessions | Shorter for admin accounts is preferable. |
| Security/action logs | 12-24 months | delete or archive | Keep longer only if needed for disputes. |
| Route/trip records | 3-6 years | archive/anonymize | Align with accounting/claims requirements. |
| Cost records | accounting period | archive | Confirm with accountant. |
| Client route data | cooperation period + claim period | delete/anonymize | Keep operational data only if still needed. |
| Employee schedule/timeline | employment/legal period | archive/delete | Confirm labour-law requirements. |
| Backups | provider default, preferably <= 30-90 days | automatic expiry | Confirm Supabase/hosting settings. |

## Implementation Tasks

- Add `deactivated_at` for users instead of immediate deletion where history is
  needed.
- Add scheduled cleanup for expired/revoked sessions.
- Add export/delete admin workflow for data-subject requests.
- Add archival/anonymization script for old route/log data after retention is
  approved.
