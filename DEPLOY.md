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

## Free deploy: Render + Neon (step by step)

Fully free: **Render free web service** (a real Node server, so the 10mb import works and `better-sqlite3`
compiles fine) + **Neon free Postgres** (persists — unlike Render's own free Postgres, which is deleted
after 90 days). Tradeoff: the Render free web service **sleeps after ~15 min idle**, so the first
request after a nap is a slow (~30–60s) cold start.

1. **Neon** — create a project (region near you). Copy the **admin/owner** connection string (it looks
   like `postgresql://<owner>:<pw>@<host>/<db>?sslmode=require`). This is only used to bootstrap roles.
2. **Create the DB roles** (from your machine, once):
   ```bash
   ADMIN_DATABASE_URL='postgresql://<owner>:<pw>@<host>/<db>?sslmode=require' node scripts/create-db-roles.mjs
   ```
   It prints two connection strings — one for `mynab_app` (runtime) and one for `mynab_migrator`
   (migrations) — with `?sslmode=require` preserved. It also transfers enum-type ownership to the
   migrator so the `AccountType` migration can run.
3. **Run migrations** against Neon (as the migrator):
   ```bash
   MIGRATE_DATABASE_URL='<the mynab_migrator string>' DB_PROVIDER=postgres npx prisma migrate deploy
   ```
4. **Render** — New → **Blueprint**, pick this repo (it reads `render.yaml`). It creates the web service
   and auto-generates `AUTH_SECRET`. Then in the service's **Environment**, set the secrets:
   `DATABASE_URL` = the `mynab_app` string, `MIGRATE_DATABASE_URL` = the `mynab_migrator` string,
   `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` = your Google OAuth creds.
5. **Google OAuth** — in Google Cloud Console, add the Render URL to the client's Authorized redirect
   URIs: `https://<your-service>.onrender.com/api/auth/callback/google`.
6. **Deploy.** The build runs `npm run build` (which now `prisma generate`s first, then `next build`);
   start is `next start`. Visit the URL and sign in with Google.

(To skip cold starts or the size cap entirely, the paid Render/Railway tier keeps it always-on.)

## Required environment variables

| Variable | Value |
|----------|-------|
| `DB_PROVIDER` | `postgres` |
| `DATABASE_URL` | app-runtime connection string — the least-privilege `mynab_app` role (see below) |
| `MIGRATE_DATABASE_URL` | migration connection string — the `mynab_migrator` role (DDL) |
| `AUTH_SECRET` | random secret for Auth.js (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | Google OAuth client id |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_ALLOWED_EMAILS` | *(optional)* comma-separated allowlist of emails permitted to sign in (case-insensitive). Unset = any Google account may sign in (each gets their own isolated budget); set it to lock the instance to just your address(es). |

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
