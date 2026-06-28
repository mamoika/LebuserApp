# LEBUSER App

React/Vite logistics app backed by Supabase.

## Environment

Create local `.env.local` from `.env.example`:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not commit real environment values.

## Commands

```sh
npm run dev
npm run lint
npm run build
```

## Security And Compliance Notes

- Security audit notes: `SECURITY_AUDIT.md`
- Deployment checklist: `SECURITY_DEPLOYMENT_CHECKLIST.md`
- RODO/EU working documents: `docs/compliance/`

The current security model uses the Supabase anon key in the browser plus
custom session-token RPCs. Direct browser writes for the hardened operational
tables have been moved behind RPCs. The frontend source now routes table reads
through session-token RPCs; deploy `db/migrations/remaining_read_rpc.sql`,
smoke-test, then run `db/migrations/revoke_remaining_direct_reads.sql` to
remove direct browser `select` grants in production.
