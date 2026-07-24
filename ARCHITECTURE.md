# mynab — notes for future sessions

A YNAB-style zero-based budgeting app. Next.js (App Router) + TypeScript + PostgreSQL + Prisma 7.
This file exists because a very long build session uncovered a lot of non-obvious behavior and a
few expensive lessons — read it before making changes, especially to `src/lib/budget.ts`.

## Status: 1.0

Tagged `v1.0.0` — the first release. The web app (Next.js + Postgres, Google OAuth) is the primary,
fully-supported target: budgeting engine, transactions register with import/reconcile, categories,
reports, multi-user with per-user isolated budgets, and an admin surface. The desktop (Electron +
SQLite) build works but is a secondary target — see the note in the dual-schema section below.

## Stack specifics

- **Prisma 7** uses the new `prisma-client` generator (not `prisma-client-js`), output to
  `src/generated/prisma`, and requires an explicit driver adapter (`@prisma/adapter-pg`) — see
  `src/lib/db.ts`. Local dev runs Postgres on `localhost:5432` (macOS); `DATABASE_URL` in `.env`
  points there. (Earlier sessions ran on WSL2 with Postgres on the Windows host reachable via the
  WSL2 gateway IP — if you're in that setup, use the gateway IP, not `localhost`.)
- **Vitest** for tests (`npm test`, which also runs the schema-parity check): `src/lib/budget.test.ts`,
  `csv.test.ts`, `qfx.test.ts`, `merchant.test.ts`, `reports.test.ts`, `auth-allowlist.test.ts`,
  `register.test.ts`.
- **⚠️ Dev server + schema changes**: after `prisma migrate dev` / `prisma generate`, **restart the
  dev server**. Turbopack does not reliably pick up a regenerated Prisma client — you'll see
  confusing "Unknown argument" or stale-type errors from a server that's still running on the old
  client, even though the code and DB are both correct. This bit us multiple times this session.
- **⚠️ Mutations from client `onClick` need `router.refresh()`**: in this Next 16 build, calling a
  Server Action directly from a client event handler does **not** auto-refresh the client from the
  action's `revalidatePath` — the DB updates but the UI stays stale until a reload (e.g. an approved
  row keeping its "NEEDS REVIEW" pill, or Ready-to-Assign not moving after you assign). So **every
  client-invoked mutation must call `router.refresh()` after the action** (see AccountsView / CatRow /
  BudgetView / CategoriesView). Modals are covered centrally: `ModalProvider`'s `close()` refreshes,
  so any modal reflects on close. Actions that navigate (`router.push`) already refresh as a side effect.

## The dual-schema split (Postgres web + SQLite desktop)

> **⚠️ Electron/desktop is viable but an afterthought.** The whole app was built web-first; the
> desktop target was bolted on afterward and gets far less exercise. It genuinely works — the
> dual-schema split, the runtime client cast in `src/lib/db.ts`, and the `electron:*` build scripts
> are all real and functional — but treat it as second-class: the parity check is only a *text*
> check (see below), desktop migrations are under-exercised (`electron/main.js`'s `runMigrations`
> DOES apply pending migrations to existing DBs on every launch, tracked in its own
> `_app_migrations` table — but it runs each migration.sql un-transactioned via `db.exec`, so a
> mid-file failure on a live DB doesn't roll back), and web-only concerns (Google OAuth, multi-user,
> admin) simply don't exist on desktop, so those code paths are gated on `DB_PROVIDER`/`showAuth`
> rather than shared. If you touch schema or data-layer code, verify the desktop build explicitly —
> don't assume web-green means desktop-green.

There are **two** Prisma schemas that must define identical models:
- `prisma/schema.postgres.prisma` → generates `src/generated/prisma-postgres` (web/server build).
- `prisma/schema.sqlite.prisma` → generates `src/generated/prisma-sqlite` (Electron desktop build).

`src/lib/db.ts` picks the client at runtime from `DB_PROVIDER` and **casts the SQLite client to the
Postgres client's type** so the rest of the app is provider-agnostic. That cast is only sound while
the two schemas are shape-identical — which `scripts/check-schema-parity.ts` enforces in `npm test`.

**When you change the schema, edit BOTH files** (everything from `enum AccountType` onward must stay
byte-for-byte identical — only the generator `output` path and datasource `provider` in the header
differ) and add a migration under **both** `prisma/migrations-postgres/` and
`prisma/migrations-sqlite/`. `prisma.config.ts` prefers `MIGRATE_DATABASE_URL`.

What the parity check does and does **not** guarantee is documented in detail at the top of
`scripts/check-schema-parity.ts`. In short: it proves the model text is identical (so it catches
type/default/index/relation drift), but it is a text check — it does **not** prove runtime parity
across the two engines. Features that differ by engine are your responsibility to keep portable; the
one that has bitten us is `createMany({ skipDuplicates })` (Postgres-only), which the import pipeline
(`src/lib/import.ts`) works around by pre-filtering duplicates in application code.

## The engine: `src/lib/budget.ts`

Everything renders from `computeDerived(inputs, month) -> Derived`, a pure function over
all-time-unfiltered `{ accounts, categories, transactions, budgetEntries }`.

- `assignedIn/assignedUpTo`, `activityIn/activityUpTo`, `available` are genuinely cumulative
  ("up to and including this month"), enabling month-to-month rollover.
- `readyToAssign = totalIncome - totalAssigned` and `netWorth` are **all-time aggregates, not
  scoped to the selected month** — matches the original single-file app's design.
- **Off-budget (tracking) accounts** (`onBudget: false` — Investment/Loan): balances count toward
  `netWorth`/`acctBalance`, but their transactions are excluded from category activity, income, and
  Ready-to-Assign (the `offBudget` set at the top of `computeDerived`). `getSidebarData`'s RTA copy
  applies the same exclusion — keep them in sync.
- **Credit card payment categories**: a `Category` with `linkedAccountId` set represents "money
  set aside to pay this card." Its activity is *derived* from the linked card's own transactions
  (`classifyCardTransaction`/`buildActivityByMonth`), not from transactions tagged with its own
  category id — a card purchase pushes the spending category down and the payment category up by
  the same amount (net zero), a payment (`TRANSFER` landing on the card) pulls the payment
  category back down. `computePaymentCategoryBreakdown` exposes the per-transaction "why" for the
  UI (`CatRow`'s breakdown line).
- **Known, deliberately unhandled edge case**: an `INCOME`-kind transaction posted directly to a
  card account (a refund, cashback, or a reconciliation adjustment) is invisible to the payment
  category's derived activity — it's real money movement that only shows up in `acctBalance`. I
  tried "fixing" this once (making `classifyCardTransaction` handle `INCOME` on cards) and it
  looked right from aggregate math, but a from-scratch test proved it **double-counts** the money
  (once via `totalIncome`, once via the payment category). Reverted. If this comes up again,
  write the isolated test *first*.
- **Split transactions** (`TransactionSplit` table): one register row allocated across multiple
  lines. The parent stays `kind: NORMAL` with `categoryId: null` and `amountCents` = the single
  real bank movement; lines must sum to it exactly (`validateSplitDraft` in `src/lib/splits.ts` —
  the SAME pure validator runs client-side in the editor and server-side in the actions). A line's
  `categoryId: null` means a Ready-to-Assign (income) line — that's how a deposit splits into
  "paycheck part + category-refund part"; those amounts feed `totalIncome`, not any category.
  Attribution in `buildActivityByMonth` is per-line and REPLACES the single-category/classify path
  for split rows (never both — that would double-count). A split CARD purchase feeds the payment
  category per categorized line via `cardPurchaseContributions`, shared with
  `computePaymentCategoryBreakdown` so the breakdown invariant can't drift. RTA lines are
  **forbidden on CREDIT accounts** (see the income-on-card double-count lesson below — same rule,
  enforced at validation). Transfers are never split; payment categories are never line targets;
  mixed-sign splits are out of scope (lines are unsigned in the editor; one direction toggle signs
  all). `BudgetInputs.splits` is deliberately REQUIRED so a construction site that forgets to
  fetch lines is a compile error, not a silently split-blind computation. NB: the reconciliation
  identity below is unaffected by splits, but (split or not) it only holds against net worth
  *excluding unpaid card debt* — a payment category's positive available has no cash counterpart
  until the payment transfer (locked by the split card-purchase test).
- **`pending`** (file-imported, not-yet-approved transactions): counted in `acctBalance`/
  `netWorth` immediately, invisible to every category/activity computation
  (`buildActivityByMonth`'s first line: `if (t.pending) return;`) until a human approves them.
  Saving any edit (`updateTransaction`) clears `pending` — that save *is* the approval, no
  separate action exists.
- **`deletedAt`** (soft delete): `deleteTransaction` sets this instead of removing the row, so a
  transaction's `externalId` keeps occupying its `(accountId, externalId)` slot forever — this is
  what stops a deleted-then-re-imported bank transaction from silently reappearing. Every read
  path filters `deletedAt: null` (see `src/lib/queries.ts` and the two spots in
  `accounts/actions.ts` — `applyOverspendCoverage`, `reconcileEligibility`).

### The hard-earned lesson: `netWorth === readyToAssign + sum(every category's available)`

This identity holds exactly for clean, fully-categorized data (verified at the time with a
controlled synthetic dataset; the invariant is also locked by tests in `budget.test.ts`). It can drift for messy, reconstructed real-world history (e.g.
transactions that were never categorized, or large one-time events like an account closure
recorded as "Income" when it was really an internal transfer). **Critically: a `BudgetEntry`
(assignment) can never fix this drift.** Assigning money to any category shifts value between
`readyToAssign` and that category's `available` — the *sum* is invariant under that operation, by
construction (`readyToAssign + sum(available) = totalIncome + totalActivityAcrossCategories`,
which no `BudgetEntry` touches). The only real levers are: (a) categorizing previously-invisible
(uncategorized) transactions — this changes `totalActivityAcrossCategories` for real, or (b)
determining that some transaction was mis-recorded (e.g. real income vs. an internal transfer)
and fixing its `kind`/categorization to match reality. Everything else is just moving the same
hole to a different, equally-wrong-looking spot. Don't re-litigate this without re-deriving it —
it took several failed attempts (and a live-corrected data-corruption incident) to nail down.

## Schema (`prisma/schema.postgres.prisma` + `schema.sqlite.prisma`)

**Budget data** (everything is stamped with `budgetId`): `Account` (CHECKING/SAVINGS/CREDIT/
INVESTMENT/LOAN; `onBudget` **is read by the engine** — Investment/Loan are off-budget tracking
accounts whose balances count toward net worth but whose transactions are excluded from category
activity, income, and Ready-to-Assign, see `computeDerived`'s `offBudget` set) → `CategoryGroup`
(`isHidden` for the payment-category group) → `Category` (`isHidden` for user-hidden categories,
`goalType`/`goalAmountCents`, `linkedAccountId` for payment categories) → `BudgetEntry` (unique on
`categoryId+yearMonth`) / `Transaction` (`kind`, `pending`, `externalId`, `deletedAt`,
`transferId`) → `Reconciliation` (one row per reconciliation attempt, clean or not — an audit trail).

**Multi-user layer** (web only): `User` (`isAdmin`, `suspendedAt`) → `Membership` (role) →
`Budget`. On first Google sign-in, `ensureUserAndBudget` (`src/lib/user-provisioning.ts`,
idempotent by email, called from the Auth.js `jwt` callback) creates the User + their first Budget
+ an `OWNER` Membership + a default category set. Every query/action resolves the active budget
through `src/lib/budget-context.ts` — desktop resolves to the single local budget
(`LOCAL_BUDGET_ID`), web validates an `activeBudgetId` cookie against the user's memberships
(`budget-context.web.ts`) and **enforces suspension in the data layer on every request** (not just
at sign-in, so a suspended user's live session dies immediately). `requireBudget(permission)` gates
mutations (`read`/`write`/`manage`). Admin (suspend/reactivate/delete users) lives at `/admin`,
gated by `requireAdmin` (`src/lib/admin.ts`) which re-checks the DB, not just the JWT hint.

**Known half-built pieces (deliberate, tracked):**
- **Budget switching**: the `activeBudgetId` cookie is read and membership-validated, but nothing
  in the UI ever *sets* it — a user with multiple memberships is pinned to their oldest one. The
  plumbing exists; the switcher doesn't.
- **`Invite` model + `MembershipRole`**: schema'd in both Prisma files but referenced nowhere in
  `src/` — budget sharing was designed, never built. Since provisioning only ever creates `OWNER`
  memberships, the `requireBudget` permission tiers are effectively vacuous today. Either build
  invites or remove the dead schema; don't half-use it.

## Import pipeline

`importTransactions` (`src/app/accounts/actions.ts`) auto-detects format from file content
(`isQfx` in `src/lib/qfx.ts`), not extension:
- **QFX/OFX**: tolerant SGML/XML parser (`parseQfx`) — handles unclosed leaf tags. `externalId` =
  the bank's own `FITID`.
- **Generic CSV** (`Date,Payee,Amount,Memo`): `externalId` = a synthesized `csv:<sha256>`
  fingerprint of `date|payee|amountCents|memo` (`csvFingerprint` in `src/lib/csv.ts`) — same
  `(accountId, externalId)` unique constraint + `skipDuplicates: true` insert, so re-importing an
  overlapping export (the normal way both banks and Quicken let you export) is a no-op for rows
  already present. Trade-off: two genuinely different transactions sharing the exact same
  date/payee/amount/memo will collide.

Every imported row lands `pending: true`. `findPossibleDuplicate` gives an advisory (not
blocking) warning when *manually* adding a transaction that looks like an existing one — native
`confirm()`, user can always override.

**Merchant extraction + category guessing (`src/lib/merchant.ts`)**: Canadian banks (RBC) put
boilerplate in the OFX `<NAME>` ("Visa Debit purchase - 4581") and the real merchant in `<MEMO>`
("GIANT TIGER #17"). `parseQfx` promotes the memo to the payee when the name is generic bank
boilerplate (`isGenericBankPayee`), keeping the original type note in the memo — so the register
is readable and matching has a clean key. On import, `importTransactions` guesses a category for
each pending row (outflows only — a positive amount is income/refund) from **the user's own
history** (`buildHistoryMap`: every already-categorized transaction, majority-voted per
normalized merchant) with a static `KNOWN_MERCHANTS` seed as fallback. The guess is a
*suggestion*: the row stays `pending`, so it never counts against a budget until approved, and
each approval becomes training data for the next import (no separate rules table — history IS the
model). Deliberately chose this over a persistent `MerchantRule` table to avoid a schema
migration against live desktop DBs. (At the time, `electron/main.js` migrated only fresh DBs;
its `runMigrations` now applies pending migrations to existing DBs on every launch, so this
constraint has relaxed — the history-IS-the-model design stays because it's simpler, not because
migration is impossible.) Split parents carry `categoryId: null`, so they're naturally excluded
from guess history; imports always arrive unsplit — users split during review.

## Reconciliation

No auto-clearing, ever. `reconcileEligibility` blocks on any `pending` row. A `Reconciliation`
row is written every time, including a clean reconciliation with no adjustment. (The old
`toggleCleared` action was removed as dead code — the cleared toggle was dropped from the UI long
before, and nothing imported it; clearing happens only via approve/save.)

## Where the engine runs (performance seams)

The engine is deliberately a pure function over ALL-TIME rows — fine in itself, but that design
must not leak into per-request costs. Three seams enforce that (2026-07 audit remediation):
- **`/budget`**: `getBudgetPageModel` (queries.ts) fetches the history and runs `computeDerived`
  SERVER-side, shipping only per-category numbers (`CatMonth`) + resolved breakdowns. BudgetView/
  CatRow never see raw transactions — don't reintroduce a client-side `computeDerived`.
- **Sidebar** (`getSidebarData`, every navigation): SQL `groupBy`/`aggregate` only — never a
  findMany that materializes transaction rows.
- **Overspend coverage** (`applyOverspendCoverageBatch`, accounts/actions.ts): ONE budget
  snapshot per action, sequential drain-RTA semantics preserved in memory. Never call the
  single-item wrapper in a loop.
- **`/reports`**: row fetch is window-bounded; `netWorthTrend` takes a SQL-summed pre-window
  `baselineCents` for its cumulative math.

## Sidebar & register chrome (`Sidebar.tsx`, `AccountsView.tsx`)

- **Ready-to-Assign is computed in `getSidebarData` (`src/lib/queries.ts`), NOT via
  `computeDerived`.** RTA is `totalIncome − totalAssigned`, and both are all-time aggregates (not
  month-scoped — see the engine section), so the sidebar can show it without knowing the selected
  month or paying for a full `computeDerived`. totalIncome has TWO terms in both places: whole
  INCOME rows plus split transactions' RTA lines. If you change the engine's formula (either
  term, or make it month-scoped), this sidebar copy must change identically — they are two
  implementations of the same formula, and the manual cross-check is "sidebar RTA === budget
  page banner".
- **Signed-in user's name** comes straight off the Auth.js session (`session.user.name`, Google's
  display name; falls back to email). Rendered at the top of the sidebar under the brand, web-only
  (gated on `showAuth`, same as Sign out) — desktop has no session.
- **"Uncleared" figure in the register header** = `unclearedCents + pendingCents`, a **signed net**
  (YNAB-style: clearing/approving an expense makes it rise toward $0). The two sums are disjoint by
  construction — imported rows land `cleared: true, pending: true` (`src/lib/import.ts`), so a
  pending row is never in the `cleared: false` set — so the sum never double-counts. `pendingCents`
  is a dedicated aggregate in `getAccountTransactions` alongside `pendingCount`. (There is no
  cleared/uncleared *toggle* — that was deliberately dropped; the register uses one clean state axis,
  tan = needs review / white = done.)

## Reports (`src/lib/reports.ts`, `ReportsView.tsx`)

A pure layer over the same all-time, unfiltered rows the engine uses — every function takes a
`months: string[]` window (from `monthsForRange`: trailing 1/3/6/12 months or YTD via
`RangePicker`), so the date-range control is just a different window, no new queries. Provides
`summary` (income/spending/net/savings-rate KPIs), `spendByCategory`, `incomeVsSpending`,
`netWorthTrend` (cumulative at each month-end), `categorySpendTrend` (top-6 categories + "Other",
keyed by category id since names can collide), `topMerchants`, and `budgetVsActual`. Gotcha:
report *series* values are **dollars** (to match the chart formatter) while the KPI `summary`
returns **cents** — don't mix them up. Chart colors come from `src/lib/viz-palette.ts`. Covered by
`reports.test.ts`.

## Dev/ops scripts (`scripts/`, not part of the running app)

(The historical YNAB-import/validation scripts — `import-ynab.ts`, `reload-ynab.ts`,
`validate-ynab.ts`, `investigate-mismatch.ts`, `generate-synthetic-year.ts` — **no longer exist**;
they served the original data migration and are gone. Docs or memories referencing them are stale.)

- `reset-demo.ts` — wipes and reseeds **every** budget in the DB with the standard demo dataset
  (the same per-budget reset the in-app "Reset demo data" button runs, via
  `resetDatabase`/`buildSeedData` in `prisma/seedData.ts`). Run:
  `npx tsx --env-file=.env scripts/reset-demo.ts`. **This is what's in the dev database** — clean
  demo data (3 accounts, ~11 categories, current-month transactions), not real financial data.
- `dev-postgres.mjs` — local dev Postgres via `embedded-postgres` (real Postgres 18 from a
  downloaded binary; data in gitignored `.pgdata`) — no system Postgres/Docker/Homebrew needed.
- `create-db-roles.mjs` — bootstraps the least-privilege `mynab_app`/`mynab_migrator` roles
  (see DEPLOY.md).
- `set-admin.ts` — grant/revoke global admin by email (`npm run admin:set`); the only way to make
  the first admin.
- `seed-user.ts` — provision a user by email with an owned, demo-seeded budget (for testing
  multi-user with a second account); idempotent.
- `check-db.ts` — quick sanity dump of users/budgets/counts.
- `check-schema-parity.ts` — the dual-schema text check, runs in `npm test`.
- `build-fat-sqlite.mjs` / `prepare-standalone.mjs` / `desymlink-standalone.mjs` /
  `sync-standalone-native.mjs` / `electron-after-pack.mjs` — Electron packaging plumbing (see the
  `electron:*` npm scripts).

## Testing notes

### Coverage status (as of 1.0)

- **What's tested** (`npm test`, Vitest, all pure-function unit tests): the budgeting engine
  (`budget.test.ts` — the big one, incl. rollover, payment categories, the netWorth/RTA identity,
  pending exclusion, split-transaction attribution), split validation rules (`splits.test.ts` —
  incl. the no-RTA-line-on-credit guard and exact-sum rule), CSV + QFX parsing (`csv.test.ts`,
  `qfx.test.ts`), merchant extraction / category guessing (`merchant.test.ts`), reports incl. the
  split fan-out (`reports.test.ts`), the sign-in allowlist (`auth-allowlist.test.ts`), and schema
  parity (`check-schema-parity.ts`).
- **What's NOT tested — know this before assessing:**
  - **No DB/integration tests.** Everything in `src/lib/queries.ts` and the Server Actions
    (`accounts/actions.ts`, etc.) runs live Prisma — there is no test harness that stands up a DB,
    so those paths are exercised only by hand.
  - Most **1.0 sidebar/register additions ship untested**: Ready-to-Assign in `getSidebarData` and
    the user-name display have no tests (both are thin server-side reads).
  - The **"Uncleared = uncleared + pending, over disjoint sets" invariant IS locked** — the state
    rule it depends on (imported rows are `cleared: true, pending: true`, so a pending row is never
    in the `cleared: false` bucket) lives in `src/lib/register.ts` (`IMPORTED_TXN_STATE` +
    `isUncleared`/`isPending`, used by `import.ts` and mirrored by the aggregates in `queries.ts`)
    and is asserted in `register.test.ts`. What is *still* untested is the Prisma `_sum` aggregation
    itself in `getAccountTransactions` — that needs a DB harness (a pure reimplementation would
    prove nothing about the real query). If you add DB integration tests, start there.

### Playwright (environment-specific)

- Current dev is macOS, where Playwright's bundled Chromium works out of the box. The note below is
  for the older WSL2 setup and does not apply on macOS.
- Playwright in that WSL2 environment needs manually patched shared libs for headless Chromium
  (`libnspr4`, `libnss3`, `libasound.so.2` missing) — fixed via `apt-get download` +
  `dpkg-deb -x` + `LD_LIBRARY_PATH`. Recreate this if a fresh session's scratchpad doesn't have it.
- **When testing modals with Playwright**: scope input selectors to `.modal` (e.g.
  `page.locator(".modal").locator('input[placeholder="0.00"]')`). The underlying page keeps
  rendering behind the modal overlay, and several inputs (a modal's amount field, a `CatRow`
  assign field) share the same placeholder — an unscoped selector can silently fill the wrong
  one and corrupt real data. This actually happened once this session (overwrote a real "Rent"
  budget assignment); caught it because the resulting numbers didn't add up, reverted immediately.
