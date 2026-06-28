# LEBUSER App - RODO Operations Readiness

Status: operational pack prepared on 2026-06-28; controller identified
(LEBUSER TEXTILSERVICE Sp. z o.o., KRS 0000648492) and RODO contact set
(info@lebuser.pl). Proposed legal bases still require legal approval before
formal adoption.

This folder is an operational compliance pack for running LEBUSER in Poland/EU.
It is not legal advice. The documents below are intended to be adopted by the
data controller, kept with company records, and reviewed after product or
provider changes.

## Decision Log

| Item | Status | Owner | Evidence / File |
| --- | --- | --- | --- |
| Data controller identified | Done (LEBUSER TEXTILSERVICE Sp. z o.o., KRS 0000648492) | Business owner | `PRIVACY_NOTICE_TEMPLATE.md` |
| Privacy notice text prepared | Prepared, pending approval | Business owner / RODO owner | `PRIVACY_NOTICE_TEMPLATE.md` |
| Privacy notice acknowledgement in app | Implemented | Technical owner | `privacy_notice_v1`, admin status view |
| Record of processing activities | Prepared, legal bases proposed (pending approval) | RODO owner | `RECORD_OF_PROCESSING.md` |
| Retention policy | Prepared, pending business approval | Business owner / RODO owner | `RETENTION_POLICY.md` |
| Breach procedure | Prepared, pending adoption | RODO owner / technical owner | `DATA_BREACH_PROCEDURE.md` |
| Breach register | Prepared | RODO owner | `BREACH_REGISTER.md` |
| Processor/subprocessor register | Prepared, provider confirmations pending | Business owner | `PROCESSORS_AND_TRANSFERS.md` |
| Access review | Initial review done 2026-06-28 | Technical owner | `../ops/ACCESS_REVIEW_2026-06-28.md` |
| Backup restore test | Done 2026-06-28 | Technical owner | `../ops/BACKUP_RESTORE_TEST.md` |
| Session governance | Implemented | Technical owner | `../ops/SESSION_PRUNING_POLICY.md` |

## Must Confirm Before Treating As Adopted

1. Controller identity (from KRS 0000648492 - verify against the official eKRS
   extract before formal adoption):
   - legal name: LEBUSER TEXTILSERVICE Sp. z o.o. - confirmed,
   - registered address: ul. Owcza 10, 66-400 Gorzów Wielkopolski - confirmed,
   - NIP 9271945131, REGON 365910038, KRS 0000648492 - confirmed,
   - RODO contact: info@lebuser.pl (no phone) - set,
   - person responsible for the app/project: Rusłan Mamoika.

2. Legal bases:
   - confirm article 6 basis for each processing activity,
   - confirm whether employee data requires extra labour-law references,
   - confirm if any location-related function requires a DPIA.

3. Provider paperwork:
   - Supabase DPA/data processing terms,
   - hosting/Vercel terms and admin access,
   - GitHub organization/account access and 2FA,
   - Sentry or any other monitoring provider if enabled,
   - backup/export location and retention.

4. Retention approval:
   - approve retention periods,
   - decide what is anonymized vs deleted,
   - add scheduled cleanup/anonymization where approved.

## Operating Cadence

| Frequency | Task | Evidence |
| --- | --- | --- |
| Monthly | Review admin users, provider accounts, GitHub Apps, env vars | `ACCESS_CONTROL_CHECKLIST.md` |
| Monthly | Review active sessions and revoke stale/unneeded ones | Admin -> Sesje |
| Quarterly | Review processor list and transfer mechanisms | `PROCESSORS_AND_TRANSFERS.md` |
| Quarterly | Review retention exceptions and old operational records | `RETENTION_POLICY.md` |
| After every provider/security change | Update provider register and access review | `PROCESSORS_AND_TRANSFERS.md`, `../ops/ACCESS_REVIEW_*.md` |
| After every privacy notice change | Increment `PRIVACY_NOTICE_VERSION` and redeploy | `src/context/AuthContext.jsx` |
| After every suspected incident | Open breach register entry within 24h | `BREACH_REGISTER.md` |

## Higher-Risk Area: Location

The app stores client/pickup locations and may use browser geolocation for
navigation. Do not add live employee tracking or location history without a
separate privacy decision. Before enabling any live tracking, document:

- exact purpose,
- legal basis,
- who can see locations,
- whether location is stored or only displayed,
- retention period,
- employee notice wording,
- whether DPIA is required.

## Evidence To Keep

- Dates of SQL migrations run in Supabase.
- Security smoke-test notes.
- Backup/restore test reports.
- Provider DPA/settings screenshots or exports.
- Admin access reviews.
- Breach register entries, including "not reportable" decisions.
- Privacy notice versions and acknowledgement status.
- Retention-policy approvals and cleanup/anonymization runs.
