# mynab

A YNAB-style **zero-based budgeting app** — give every dollar a job, with month-to-month rollover,
credit-card payment tracking, bank-file import, and reconciliation.

Built **web-first** on Next.js (App Router) + TypeScript + PostgreSQL + Prisma 7, with a secondary
Electron + SQLite desktop build. **Current release: `v1.0.0`.**

> Working on the code? Read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** first — it documents the
> budgeting engine's invariants, the dual-schema (Postgres/SQLite) split, the import pipeline, and a
> number of non-obvious, hard-won behaviors. **[`AGENTS.md`](./AGENTS.md)** notes that this is a
> newer Next.js than your training data may assume — check `node_modules/next/dist/docs/` before
> writing framework code.

## Features

- **Zero-based budgeting engine** — assigned / activity / available are cumulative (true rollover),
  plus Ready-to-Assign and net worth. Pure `computeDerived()` over all transactions.
- **Credit-card payment categories** — a payment category's activity is *derived* from the linked
  card's own transactions, with a per-transaction breakdown of the "why".
- **Transactions register** — QFX/OFX + generic CSV import (format auto-detected), category guessing
  from your own history, a deliberate pending → approve review flow, and reconciliation
  ("Adjust balance") that never auto-clears.
- **Budget, Categories, and Reports** views.
- **Multi-user web app** — Google OAuth (with an optional email allowlist), per-user isolated
  budgets, and an admin surface.

## Getting started (web / Postgres)

Requires Node.js 20+ and npm. For the database you don't need system Postgres/Docker/Homebrew —
`node scripts/dev-postgres.mjs` runs a real embedded Postgres on `localhost:5432` (data in the
gitignored `.pgdata/`); any other Postgres works too.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment** — copy the example and fill it in:
   ```bash
   cp .env.example .env
   ```
   Key variables (see `.env.example` for the full annotated list):
   - `DB_PROVIDER=postgres`
   - `DATABASE_URL` — your Postgres connection string
   - `AUTH_SECRET` — generate with `npx auth secret`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth 2.0 credentials
   - `AUTH_ALLOWED_EMAILS` *(optional)* — comma-separated allowlist; unset = any Google account
   - `ENABLE_DEMO_RESET=true` *(optional)* — shows the destructive "Reset demo data" button

3. **Set up the database** (generate the Prisma clients, then apply migrations). `prisma.config.ts`
   picks the schema + migrations folder from `DB_PROVIDER`, so no `--schema` flag is needed; set
   `MIGRATE_DATABASE_URL` if your migrator role differs from the app's `DATABASE_URL`:
   ```bash
   npm run db:generate
   npx prisma migrate deploy
   ```

4. **Seed demo data** (optional, for local dev — no real financial data ships in the repo):
   ```bash
   npx tsx --env-file=.env scripts/reset-demo.ts
   ```

5. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

6. **Grant yourself admin** (optional — there is no in-app "make admin" flow; sign in once first so
   your user row exists):
   ```bash
   npm run admin:set you@example.com
   ```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (Postgres). |
| `npm run dev:sqlite` | Dev server against a local SQLite file (desktop-style, no auth). |
| `npm run build` | Generate Prisma clients + production build. |
| `npm test` | Schema-parity check + Vitest unit tests. |
| `npm run admin:set <email>` | Grant global admin (`--revoke` to remove). |
| `node scripts/dev-postgres.mjs` | Run a local embedded Postgres (no system install needed). |
| `npx tsx --env-file=.env scripts/reset-demo.ts` | Wipe + reseed every budget with demo data. |
| `npx tsx scripts/seed-user.ts <email>` | Provision a second demo-seeded user (multi-user testing). |
| `npx tsx --env-file=.env scripts/check-db.ts` | Quick sanity dump of users/budgets. |
| `npm run electron:*` | Desktop build/pack tasks — see below. |

## Desktop build (Electron + SQLite)

The desktop target is **viable but secondary** — the app was built web-first and Electron was added
afterward. It works (dual-schema split, runtime client cast in `src/lib/db.ts`, `electron:*` build
scripts), but it gets less exercise and web-only features (Google OAuth, multi-user, admin) don't
apply there. If you change schema or data-layer code, verify the desktop build explicitly — see the
dual-schema section in `ARCHITECTURE.md`.

## Testing

```bash
npm test
```

Runs the schema-parity check and the Vitest unit suite (budgeting engine, CSV/QFX parsing, merchant
guessing, reports, auth allowlist). Note: there are **no DB/integration tests** — the query layer
and Server Actions are exercised by hand. See the coverage-status note in `ARCHITECTURE.md`.

## Deployment

**See [`DEPLOY.md`](./DEPLOY.md) for the full runbook** — hosting choices (a persistent Node
service, not serverless: the 10mb import Server Action exceeds serverless body caps), the free
Render + Neon walkthrough via `render.yaml`, least-privilege DB roles
(`scripts/create-db-roles.mjs`: `mynab_app` runtime / `mynab_migrator` DDL), Google OAuth setup,
and the production fail-fast guard that refuses to boot with `DB_PROVIDER=sqlite`.

The reference deployment is **Render** (web service) + **Neon** (serverless Postgres), with Google
OAuth and `AUTH_ALLOWED_EMAILS` gating access. Run `npx prisma migrate deploy` on every release —
web migrations are not auto-applied.
