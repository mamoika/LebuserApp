# Access Control Checklist

Review monthly, after every employee/admin change, and after connecting any new
GitHub App, Vercel integration, Supabase integration or monitoring provider.

Last completed review: see `../ops/ACCESS_REVIEW_2026-06-28.md`.

## Supabase

- [ ] Owner/admin accounts are named accounts, not shared logins.
- [ ] 2FA enabled for every owner/admin.
- [ ] Organization/project members still need access.
- [ ] SQL editor access limited to trusted admins.
- [ ] Service-role keys are not stored in frontend env or repository.
- [ ] Anon key exposure is intentional and protected by RLS/RPC design.
- [ ] API keys/secrets reviewed and old keys rotated if no longer needed.
- [ ] Project region and backup/restore evidence documented.
- [ ] Edge/function secrets reviewed.

## GitHub

- [ ] 2FA enabled for all repository admins/collaborators.
- [ ] Collaborators still need access.
- [ ] GitHub Apps/OAuth Apps reviewed, including Codex/GitHub integrations.
- [ ] Branch protection for `main` reviewed.
- [ ] Repository secrets/actions secrets reviewed.
- [ ] No production env values or database exports committed.
- [ ] Old branches/PRs do not contain secrets.

## Hosting / Vercel

- [ ] Owner/admin accounts are named and have 2FA.
- [ ] Project members still need access.
- [ ] Environment variables reviewed.
- [ ] No service-role key in frontend environment.
- [ ] Deployment logs do not expose secrets.
- [ ] Domain uses HTTPS.
- [ ] Preview deployments do not expose sensitive data unexpectedly.

## Monitoring / Sentry

- [ ] Project is enabled only if DPA/data processing terms are accepted.
- [ ] EU data residency selected if available.
- [ ] `sendDefaultPii: false` verified.
- [ ] Session Replay/screen recording disabled unless separately approved.
- [ ] Members and 2FA reviewed.
- [ ] Retention settings reviewed.

## App Users And Sessions

- [ ] Admin users reviewed in Admin panel.
- [ ] Users who left are removed/deactivated.
- [ ] Unclaimed accounts/no-password users reviewed.
- [ ] Role assignments reviewed.
- [ ] Admin impersonation used only for support.
- [ ] Active sessions reviewed in Admin -> Sesje.
- [ ] Suspicious/stale sessions revoked.
- [ ] Device labels reviewed for unusual access patterns.

## Evidence

For each completed review, create an ops note:

- date,
- reviewer,
- providers reviewed,
- changes made,
- unresolved items,
- screenshots/exports stored in controlled company storage if needed.
