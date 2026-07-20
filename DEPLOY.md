# Deploying mynab (web / multi-user)

The web build is a long-running Next.js 16 server (App Router + Server Actions + `middleware`/proxy)
backed by Postgres via Prisma. It is **not** a static export and needs a Node runtime plus a
persistent Postgres database. (The SQLite path is only for the Electron desktop build — never deploy
the web server with `DB_PROVIDER=sqlite`; that disables auth entirely.)

## Where to host

**Recommended: Railway or Render** — run it as a persistent Node service with managed Postgres on the
same platform. This avoids serverless request-body caps, which matter here: the CSV/QFX import raises
the Server Action body limit to `10mb` (`next.config.ts`), above the ~4.5MB cap on serverless
platforms like Vercel Hobby.

**Alternative: Vercel + Neon/Supabase Postgres** — best Next.js DX, but the `10mb` import Server Action
collides with Vercel's serverless payload limit. Choose this only if you move the import to a route
handler with direct upload, or accept the smaller limit.

## Required environment variables

| Variable | Value |
|----------|-------|
| `DB_PROVIDER` | `postgres` |
| `DATABASE_URL` | app-runtime connection string — the least-privilege `mynab_app` role (see below) |
| `MIGRATE_DATABASE_URL` | migration connection string — the `mynab_migrator` role (DDL) |
| `AUTH_SECRET` | random secret for Auth.js (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | Google OAuth client id |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

`trustHost: true` is already set (`src/auth.config.ts`), so Auth.js works off-Vercel without extra
host config.

## Database roles (least privilege)

The app must **not** connect as the Postgres superuser. Two non-superuser roles are used:

- `mynab_app` — app runtime: `SELECT/INSERT/UPDATE/DELETE` only, no DDL, owns nothing.
- `mynab_migrator` — owns the schema + tables, has DDL, runs migrations only.

Bootstrap them once against the target database. Safe to re-run: an existing role keeps its password
(so a re-run can't break a running app) — pass `MIGRATOR_PASSWORD` / `APP_PASSWORD` to rotate one
deliberately. The printed connection strings preserve the host, port, and query params (e.g.
`?sslmode=require`) from `ADMIN_DATABASE_URL`.

```bash
# ADMIN_DATABASE_URL = an admin/superuser connection to the target DB (create the `mynab` DB first).
# A role's password is generated + printed on first creation; on re-run it is left unchanged unless
# you explicitly pass MIGRATOR_PASSWORD / APP_PASSWORD.
ADMIN_DATABASE_URL='postgresql://<admin>:<pw>@<host>:5432/mynab?sslmode=require' node scripts/create-db-roles.mjs
```

Copy the two printed connection strings into `DATABASE_URL` and `MIGRATE_DATABASE_URL`.

## Release steps

```bash
npm ci
npm run db:generate                 # generate the Prisma client
npx prisma migrate deploy           # runs as mynab_migrator (prisma.config.ts prefers MIGRATE_DATABASE_URL)
npm run build                       # next build
npm start                           # next start  (persistent Node process)
```

Run `npx prisma migrate deploy` on every release — web migrations are **not** auto-applied on launch
(that logic in `electron/main.js` is desktop/SQLite only).

## Google OAuth

Add the deployed callback URL to the Google Cloud OAuth client's "Authorized redirect URIs":

```
https://<your-domain>/api/auth/callback/google
```

## Recommended hardening

- **Fail-fast guard** (implemented in `src/instrumentation.ts`): a production server refuses to boot
  if `DB_PROVIDER=sqlite`, so a misconfiguration can't silently disable authentication. SQLite is
  still allowed for the Electron desktop build (`ELECTRON_RUN_AS_NODE=1`) and local `dev:sqlite`.
- Keep the superuser/admin Postgres credentials out of the app environment entirely; they're only
  needed to run `scripts/create-db-roles.mjs`.
