# Podmioty Przetwarzające I Transfery

Status: template - fill with actual provider settings.

## Provider Checklist

For each provider, record:

- provider name,
- service purpose,
- categories of data,
- region/data location,
- whether DPA/data processing terms are accepted,
- sub-processors link/export,
- transfer mechanism if outside EEA,
- admin accounts with access,
- 2FA status,
- backup/retention notes.

## Supabase

- Purpose: database, API, authentication/session storage through custom tables.
- Data categories: app operational data, users, sessions, logs, costs, routes.
- Project region:
- DPA accepted:
- Sub-processors reviewed:
- 2FA enabled on owner/admin accounts:
- Backup policy:
- Notes:

## Hosting

- Provider:
- Purpose: frontend hosting.
- Data categories: app bundle, environment variables, deployment logs.
- Region:
- DPA accepted:
- 2FA enabled:
- Notes:

## GitHub

- Purpose: source code repository and deployment workflow.
- Data categories: code, issues/PRs, maybe operational notes if added manually.
- DPA/data terms:
- 2FA enabled:
- Admin users:
- Notes:

## Sentry (frontend error monitoring)

- Purpose: frontend error monitoring (uncaught errors, promise rejections,
  React render crashes, failed data loads).
- Data categories: error reports and stack traces; technical context
  (browser, OS, URL); app-internal user identifier (account id, login, role)
  attached to events. No names/emails. Session Replay is OFF.
- PII minimization: `sendDefaultPii: false` (no IP address, cookies, or
  request headers sent); no screen/DOM recording.
- Region/data location: choose EU data residency when creating the project
  (DSN host `*.ingest.de.sentry.io`).
- DPA accepted:
- Transfer mechanism if outside EEA (only if US region chosen):
- Sub-processors reviewed:
- 2FA enabled on owner/admin accounts:
- Activation: only when `VITE_SENTRY_DSN` is set at build time.
- Notes:

## Other Providers

Add email, monitoring, analytics, backup, accounting or support tools if they
receive personal data or access to systems containing personal data.
