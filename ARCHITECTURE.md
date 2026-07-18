# mynab — notes for future sessions

A YNAB-style zero-based budgeting app. Next.js (App Router) + TypeScript + PostgreSQL + Prisma 7.
This file exists because a very long build session uncovered a lot of non-obvious behavior and a
few expensive lessons — read it before making changes, especially to `src/lib/budget.ts`.

## Stack specifics

- **Prisma 7** uses the new `prisma-client` generator (not `prisma-client-js`), output to
  `src/generated/prisma`, and requires an explicit driver adapter (`@prisma/adapter-pg`) — see
  `src/lib/db.ts`. Postgres runs on the Windows host; from WSL2 it's reachable via the WSL2
  gateway IP, not `localhost`.
- **Vitest** for tests (`npm test`): `src/lib/budget.test.ts`, `csv.test.ts`, `qfx.test.ts`.
- **⚠️ Dev server + schema changes**: after `prisma migrate dev` / `prisma generate`, **restart the
  dev server**. Turbopack does not reliably pick up a regenerated Prisma client — you'll see
  confusing "Unknown argument" or stale-type errors from a server that's still running on the old
  client, even though the code and DB are both correct. This bit us multiple times this session.

## The engine: `src/lib/budget.ts`

Everything renders from `computeDerived(inputs, month) -> Derived`, a pure function over
all-time-unfiltered `{ accounts, categories, transactions, budgetEntries }`.

- `assignedIn/assignedUpTo`, `activityIn/activityUpTo`, `available` are genuinely cumulative
  ("up to and including this month"), enabling month-to-month rollover.
- `readyToAssign = totalIncome - totalAssigned` and `netWorth` are **all-time aggregates, not
  scoped to the selected month** — matches the original single-file app's design.
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

This identity holds exactly for clean, fully-categorized data (verified with a controlled
synthetic dataset — see below). It can drift for messy, reconstructed real-world history (e.g.
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

## Schema (`prisma/schema.prisma`)

`Account` (CHECKING/SAVINGS/CREDIT, `onBudget` field exists but **is not read anywhere in the
engine** — a real gap if on/off-budget tracking accounts (RRSP-style) are ever added back) →
`CategoryGroup` (`isHidden` for the payment-category group) → `Category` (`isHidden` for
user-hidden categories, `goalType`/`goalAmountCents`, `linkedAccountId` for payment categories) →
`BudgetEntry` (unique on `categoryId+yearMonth`) / `Transaction` (`kind`, `pending`, `externalId`,
`deletedAt`, `transferId`) → `Reconciliation` (one row per reconciliation attempt, clean or not —
an audit trail).

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
migration against live desktop DBs (and the Electron migrate-only-on-fresh-DB gap in
`electron/main.js`).

## Reconciliation

No auto-clearing, ever. `reconcileEligibility` blocks (in this order) on any `pending` row first,
then any uncleared row. `toggleCleared` separately blocks uncleared→cleared for an uncategorized
`NORMAL` transaction or a still-`pending` one. A `Reconciliation` row is written every time,
including a clean reconciliation with no adjustment.

## One-off scripts (repo root, not part of the app)

These exist for data migration/generation/validation, not the running app itself:
- `import-ynab.ts` — full YNAB CSV export → DB, **wipes and recreates accounts/categories with
  brand-new ids** (breaks any open browser tab referencing old ids). Only use for a genuine
  from-scratch import.
- `reload-ynab.ts` — same export, but looks up existing accounts/categories by name instead of
  recreating them, so ids (and any open browser tabs/bookmarks) stay valid. Prefer this one.
- `validate-ynab.ts` / `investigate-mismatch.ts` — compare `computeDerived()` output against
  YNAB's own historical Plan.csv Activity/Available figures, for auditing import fidelity.
- `generate-synthetic-year.ts` — wipes the DB and generates a clean, fully-controlled 12-month
  synthetic budget (3 accounts, ~13 categories, realistic recurring transactions, a credit card
  paid off in full every month) specifically so the engine's math can be verified exactly rather
  than forensically reconstructed from messy real history. **As of this writing, this is what's
  in the dev database** — not real financial data.

## Testing notes

- Playwright in this WSL2 environment needs manually patched shared libs for headless Chromium
  (`libnspr4`, `libnss3`, `libasound.so.2` missing) — fixed via `apt-get download` +
  `dpkg-deb -x` + `LD_LIBRARY_PATH`. Recreate this if a fresh session's scratchpad doesn't have it.
- **When testing modals with Playwright**: scope input selectors to `.modal` (e.g.
  `page.locator(".modal").locator('input[placeholder="0.00"]')`). The underlying page keeps
  rendering behind the modal overlay, and several inputs (a modal's amount field, a `CatRow`
  assign field) share the same placeholder — an unscoped selector can silently fill the wrong
  one and corrupt real data. This actually happened once this session (overwrote a real "Rent"
  budget assignment); caught it because the resulting numbers didn't add up, reverted immediately.
