# Access Review - 2026-06-28

Status: completed with external dashboard blockers.

Scope:

- GitHub repository access and repository secrets.
- Vercel hosting access and environment variables.
- Supabase organization/project access, API keys, Edge secrets and app users.
- Repository scan for committed credentials.

## Summary

Verified through CLI/API where possible. GitHub and Vercel dashboard-level
access could not be fully verified from this machine because GitHub API calls
timed out and Vercel CLI had no stored credentials. Those checks remain open
and must be completed in the provider dashboards.

## Supabase

Verified project context:

- Linked project: `suvyqbyrcpzrtxbnuunu`
- Name: `Lebuser APP Project`
- Organization: `Lebuser` (`trtypfpltnrtjwvxeqlh`)
- Region: West EU (Ireland)
- Additional accessible project: `mamoika` (`uthtjvwnbkyydlzpyzsz`), East US
  (North Virginia), organization `vercel_icfg_ISvGRvJP4WgtrwJ5z8H4Etvt`

API keys present, names/types only:

- `anon` / legacy
- `service_role` / legacy
- `default` / publishable
- `default` / secret

Edge/function secrets:

- `SUPABASE_DB_URL`

App users reviewed:

| Username | Role | Password set |
| --- | --- | --- |
| `mamoika` | `admin` | yes |
| `thomas` | `admin_viewer` | yes |
| `muller` | `admin_viewer_driver` | yes |
| `filip` | `driver` | yes |
| `henryk` | `driver` | no |
| `marcin` | `driver` | yes |
| `patryk` | `driver` | no |
| `oksana` | `viewer` | no |

Session review:

| Username | Role | Active sessions |
| --- | --- | ---: |
| `henryk` | `driver` | 42 |
| `mamoika` | `admin` | 42 |
| `filip` | `driver` | 22 |
| `marcin` | `driver` | 6 |
| `muller` | `admin_viewer_driver` | 5 |
| `thomas` | `admin_viewer` | 5 |
| `oksana` | `viewer` | 3 |
| `patryk` | `driver` | 1 |

Other session counts:

- Active sessions total: 126
- Expired but unrevoked sessions: 0
- Revoked sessions: 39

Remediation update:

- Old/duplicate active sessions were revoked after this review. See
  `SESSION_REVOCATION_2026-06-28.md`.

Findings:

- Three app accounts are unclaimed/no-password: `henryk`, `patryk`, `oksana`.
- Active sessions are high for a small team, especially `henryk`, `mamoika`
  and `filip`.
- Supabase organization members, owner 2FA, SQL editor access and DPA status
  were not available through the CLI used here. Verify in the Supabase dashboard.

Recommended actions:

- Revoke old sessions after confirming it is acceptable to log users out.
- Add session pruning or lower session lifetime if 30-day multi-session access
  is not required.
- Either set first passwords for `henryk`, `patryk`, `oksana` or deactivate
  unused accounts.
- Verify in Supabase dashboard: organization members, 2FA, SQL editor access,
  billing owner, DPA/sub-processors and backup/PITR settings.
- Rotate service-role/secret keys if there is any chance they were copied into
  local scripts or gateway machines during setup.

## GitHub

Verified locally:

- Remote: `https://github.com/mamoika/LebuserApp.git`
- GitHub CLI installed: `gh 2.95.0`
- Active account reported by `gh auth status`: `mamoika`

Blocked checks:

- `gh` and unauthenticated `curl` calls to `api.github.com` timed out from this
  machine during the review.
- Collaborators, admin roles, branch protection, repository Actions secrets,
  GitHub Apps/installations and 2FA enforcement were not verified by API.

Required manual dashboard checks:

- Repository collaborators and roles.
- Whether every admin has 2FA enabled.
- Branch protection on `main` and whether direct pushes are intentionally
  allowed.
- GitHub Apps/OAuth apps installed for the repo/account, including Codex and
  Vercel.
- Actions secrets and variables by name; remove unused tokens.
- Deploy keys and webhooks.

## Vercel

Verified locally:

- No `.vercel` project link folder was present in this checkout.
- No `~/.vercel` local credentials folder was present.
- `npx vercel whoami` found no existing credentials and then failed during
  login fetch.

Blocked checks:

- Vercel team/project members, 2FA, project link, environment variables and
  Git integration access were not verified by API.

Required manual dashboard checks:

- Project owner/team and all members with roles.
- 2FA status for every account with access.
- GitHub integration access scope.
- Production/Preview/Development env var names; ensure sensitive variables are
  marked sensitive.
- Confirm `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN`, Supabase URL/anon key and gateway settings are present
  only where needed.
- Review deploy logs for accidental secret exposure.

## Repository Secrets Scan

Checked tracked files for obvious JWT/key-like values and high-risk secret
names. Real secret values were not printed.

Result:

- `.env.local` exists and is untracked.
- `.env.example` is tracked and contains only names/placeholders.
- No service-role key value was found in active app code.
- Historical JWT-like Supabase keys were found in archived `old/` scripts and
  were redacted in this review.

Redacted files:

- `old/legacy-root/test_login.js`
- `old/react-app-workbench/import_clients.js`
- `old/react-app-workbench/import_lebuser.mjs`
- `old/react-app-workbench/scratch2.js`
- `old/react-app-workbench/seed_clients.js`
- `old/react-app-workbench/seed_routes.js`
- `old/react-app-workbench/update-groups.js`
- `old/supabase-app/src/js/supabaseClient.js`

Remaining name-only references are expected:

- Gateway code references `ServiceRoleKey`, but the checked-in
  `appsettings.json` value is empty.
- Sentry build env names are documented but not committed with values.
- SQL migrations reference the Postgres `service_role` database role.

## Direct Browser Read Probe

Attempted to test selected Supabase REST table reads with the anon key from
local `.env.local`.

Result:

- The probe timed out from this machine, so no reliable conclusion was recorded
  in this access review.
- Keep using the dedicated security smoke test for direct read verification.

## Follow-Up Checklist

- Complete GitHub dashboard checks and paste/export evidence into this file or
  a dated follow-up.
- Complete Vercel dashboard checks and paste/export evidence into this file or
  a dated follow-up.
- Complete Supabase dashboard checks for organization members, 2FA and SQL
  editor access.
- Decide whether to revoke all active app sessions and force a clean login.
- Decide whether to deactivate or claim no-password app accounts.
- Add a repeatable smoke/access script so future reviews do not depend on
  manual CLI probing.
