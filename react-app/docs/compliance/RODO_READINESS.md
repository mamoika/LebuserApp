# LEBUSER App - RODO/EU Readiness Plan

Date: 2026-06-05

This folder is a working compliance pack for operating the app in Poland/EU.
It is not legal advice. Fill the placeholders with company-specific data and
have the final version reviewed by the person responsible for data protection.

## Current Status

The app stores logistics and work-organization data in Supabase and uses a
custom session-token login flow. Direct browser writes to the most sensitive
operational tables have been moved behind session-token RPC functions and
direct write grants have been revoked in the live database.

Direct browser reads still remain and are the next main technical hardening
phase before the app should be treated as fully hardened for production.

## Must-Have Before Regular EU/Poland Use

1. Identify the data controller.
   - Company name:
   - Address:
   - Contact email:
   - NIP/KRS, if applicable:

2. Complete the privacy notice.
   - Use `PRIVACY_NOTICE_TEMPLATE.md`.
   - Provide it to employees/users before or at first use.

3. Complete the record of processing activities.
   - Use `RECORD_OF_PROCESSING.md`.
   - Keep it updated when app modules or data categories change.

4. Confirm processors and contracts.
   - Use `PROCESSORS_AND_TRANSFERS.md`.
   - Supabase, hosting, GitHub and backup providers must have DPA/data
     processing terms accepted.

5. Adopt breach handling.
   - Use `DATA_BREACH_PROCEDURE.md`.
   - Maintain an internal breach register even for incidents not reported to
     UODO.

6. Adopt retention rules.
   - Use `RETENTION_POLICY.md`.
   - Convert the policy into app/database cleanup once the business approves
     retention periods.

7. Lock down administrator access.
   - 2FA on Supabase, GitHub, hosting and email accounts.
   - Named accounts only; no shared admin account.
   - Remove access for people who no longer need it.

8. Complete read hardening.
   - Replace direct table reads with session-token RPCs.
   - Revoke `select` grants from browser roles after the RPC read path is
     tested.

## Higher-Risk Area: GPS/Location

The app has map coordinates for clients and a user geolocation button. If live
driver tracking or employee location history is added, treat it as a separate
privacy-risk item. Before enabling live tracking, define:

- exact purpose,
- legal basis,
- who can see locations,
- whether location is stored or only displayed,
- retention period,
- employee notice wording,
- whether DPIA is needed.

## Evidence To Keep

- Dates of SQL migrations run in Supabase.
- Security smoke-test notes.
- Screenshots or exports of provider DPA/settings.
- List of admin users and access reviews.
- Breach register, even if empty.
- Versions of privacy notice and retention policy.
