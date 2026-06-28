# Podmioty Przetwarzające I Transfery

Status: operational register prepared on 2026-06-28. Provider contracts,
DPA/data processing terms and transfer mechanisms must be confirmed by the
business owner before formal adoption.

## Review Rules

For every provider keep evidence of:

- provider name and account/organization,
- service purpose,
- categories of data,
- region/data location,
- DPA/data processing terms accepted,
- sub-processors reviewed,
- transfer mechanism if data may leave the EEA,
- admin accounts with access,
- 2FA status,
- backup/retention notes,
- date of last review.

## Current Providers

| Provider | Purpose | Data categories | Region/location | DPA / terms | Transfer note | Access / 2FA | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database, PostgREST/RPC API, storage of custom sessions, backups | App operational data, users, sessions, logs, costs, routes | Project `suvyqbyrcpzrtxbnuunu`, West EU (Ireland) | TODO confirm accepted terms/DPA | TODO confirm sub-processors and any support transfer | TODO review org members and 2FA | In use |
| Vercel / hosting provider | Frontend hosting, env vars, deployment logs | App bundle, env vars, deployment metadata; no business data intentionally stored | TODO confirm project/account and region | TODO | TODO | TODO review account access and 2FA | In use if deployment runs there |
| GitHub | Source code repository and GitHub Apps/integrations | Code, PRs/issues, operational notes if manually added | TODO confirm account/org | TODO | TODO | TODO review collaborators, Apps, 2FA | In use |
| Sentry | Frontend error monitoring if `VITE_SENTRY_DSN` is configured | Error reports, stack traces, URL, browser/OS, app user id/login/role; no names/emails by design | TODO choose/confirm EU data residency | TODO | TODO if non-EU region | TODO review members, 2FA | Optional/conditional |
| Email/provider used for company contact | Privacy requests and incident communication | Names/emails/messages sent to privacy contact | TODO | TODO | TODO | TODO | TODO |
| Backup/export storage outside Supabase | Manual exports, restore tests, incident evidence | Database dumps or reports if exported | TODO | TODO | TODO | TODO | Use only if approved |

## Provider-Specific Notes

### Supabase

- Project reference: `suvyqbyrcpzrtxbnuunu`
- Region observed in access review: West EU (Ireland)
- Data stored: primary application database, sessions, logs, operational data.
- Security controls in app:
  - browser uses anon key plus session-token RPC,
  - service role key must not be present in frontend/repo,
  - session tokens and passwords are hashed in database,
  - direct access is progressively revoked and verified in security work.
- Evidence to attach:
  - screenshot/export of org members,
  - 2FA status for admins,
  - DPA/data processing terms,
  - backup/restore configuration,
  - support access / subprocessor list.

### Hosting / Vercel

- Store only public frontend bundle and environment variables.
- Do not put service-role keys in frontend env.
- Evidence to attach:
  - project members,
  - 2FA status,
  - env var inventory,
  - deployment logs do not expose secrets,
  - DPA/data processing terms.

### GitHub

- Repository should not contain secrets or production exports.
- Evidence to attach:
  - collaborators/admins,
  - GitHub Apps and OAuth apps,
  - branch protection status,
  - 2FA status,
  - secrets inventory if GitHub Actions are used.

### Sentry

- Current frontend code minimizes PII:
  - `sendDefaultPii: false`,
  - no Session Replay,
  - Sentry user context contains app id, login and role only.
- Before enabling:
  - choose EU data residency if available,
  - accept DPA/data processing terms,
  - confirm retention settings,
  - document member access.

## Quarterly Review Checklist

- [ ] No unknown admins/collaborators in Supabase, hosting, GitHub, Sentry.
- [ ] 2FA enabled for every admin account.
- [ ] GitHub Apps/OAuth apps still needed.
- [ ] Env vars do not include old/unused tokens.
- [ ] DPA/subprocessor links reviewed for changed providers.
- [ ] No manual database exports stored in unmanaged locations.
- [ ] Any new tool receiving personal data added to this register.
