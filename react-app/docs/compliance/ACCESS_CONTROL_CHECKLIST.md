# Access Control Checklist

Review monthly and after every employee/admin change.

## Supabase

- Owner account has 2FA.
- Every admin uses a named account.
- No shared passwords.
- Service-role keys are not stored in the frontend or repository.
- Database backups and project region are documented.
- SQL editor access is limited to trusted admins.

## GitHub

- 2FA enabled for all repository admins.
- Branch protection considered for `main`.
- Secrets are stored in deployment provider, not committed.
- Old collaborators removed.

## Hosting

- 2FA enabled.
- Environment variables set only in hosting settings.
- Deploy logs do not expose secrets.
- Domain uses HTTPS.

## App

- Admin users reviewed.
- Users who left are deactivated or removed.
- Default passwords / unclaimed accounts reviewed.
- Role assignments reviewed.
- Admin impersonation used only for support and logged.
