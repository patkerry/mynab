"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireBudget } from "@/lib/budget-context";
import { parseMoney, uid, curYM, monthKeyOf } from "@/lib/format";
import { PAYMENT_GROUP_NAME, buildPaymentCategoryDraft, computeOverspendCoverage } from "@/lib/budget";
import { parseCsv, normalizeDate, csvFingerprint } from "@/lib/csv";
import { isQfx, parseQfx } from "@/lib/qfx";
import { buildHistoryMap, guessCategoryId, KNOWN_MERCHANTS } from "@/lib/merchant";
import type { Prisma, AccountType } from "@/generated/prisma-postgres/client";
import type { TxnDraft, ImportResult } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/", "layout");
}

// A payment category's activity is entirely derived from its linked card's transactions
// (see computeDerived/buildActivityByMonth in src/lib/budget.ts) — it must never be the direct
// categoryId of a transaction. Tagging one directly would double-count against the derived
// contribution and cancel to a net-zero effect on every category, silently discarding that
// transaction's budget impact. Checked server-side (not just hidden from the UI picker) so
// this can't be bypassed by calling the action directly. Scoped to the active budget so a
// caller can't probe another budget's categories by id.
async function isPaymentCategory(categoryId: string, budgetId: string): Promise<boolean> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, budgetId }, select: { linkedAccountId: true } });
  return category?.linkedAccountId != null;
}

// Applies computeOverspendCoverage (src/lib/budget.ts): if this transaction was a credit card
// purchase that pushed its category negative, auto-assign the shortfall from Ready-to-Assign —
// same mechanism a manual assignment uses (upsert a BudgetEntry), just auto-triggered. Only
// fires for CREDIT accounts with a real categoryId, matching the deferred item's exact scope;
// cash overspending is untouched. Must run inside the same `tx` as the transaction write so it
// sees it when re-fetching current state. All reads/writes scoped to the active budget.
async function applyOverspendCoverage(tx: Prisma.TransactionClient, budgetId: string, accountId: string, categoryId: string | null, date: string) {
  if (!categoryId) return;
  const account = await tx.account.findFirst({ where: { id: accountId, budgetId } });
  if (account?.type !== "CREDIT") return;

  const [accounts, categories, transactions, budgetEntries] = await Promise.all([
    tx.account.findMany({ where: { budgetId } }),
    tx.category.findMany({ where: { budgetId } }),
    tx.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    tx.budgetEntry.findMany({ where: { budgetId } }),
  ]);
  const month = monthKeyOf(date);
  const coverage = computeOverspendCoverage({ accounts, categories, transactions, budgetEntries }, categoryId, month);
  if (coverage <= 0) return;

  await tx.budgetEntry.upsert({
    where: { categoryId_yearMonth: { categoryId, yearMonth: month } },
    update: { amountCents: { increment: coverage } },
    create: { budgetId, categoryId, yearMonth: month, amountCents: coverage },
  });
}

export type PossibleDuplicate = { date: string; payee: string; amountCents: number };

// Advisory-only check, called by the "Add transaction" UI before it saves — never blocks by
// itself, just gives the caller enough to warn the user with a confirm/override. Scoped to
// same account + date + payee (case-insensitive) + signed amount; transfers are skipped since
// their payee ("Transfer to X") is synthesized, not user-typed, and two legitimate transfers
// between the same accounts on the same day for the same amount is a real, unremarkable case.
export async function findPossibleDuplicate(draft: TxnDraft): Promise<PossibleDuplicate | null> {
  const { budgetId } = await requireBudget("read");
  if (draft.categoryId.startsWith("transfer:")) return null;
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return null;
  const isIncome = draft.categoryId === "income";
  const amountCents = isIncome ? cents : -cents;
  const payee = draft.payee.trim() || (isIncome ? "Income" : "Payee");

  const existing = await prisma.transaction.findFirst({
    where: { budgetId, accountId: draft.accountId, date: draft.date, payee: { equals: payee, mode: "insensitive" }, amountCents, deletedAt: null },
  });
  return existing ? { date: existing.date, payee: existing.payee, amountCents: existing.amountCents } : null;
}

// Ports addTxn (ynab-clone.jsx lines 575-596): categoryId is "transfer:<accountId>",
// "income", "" (uncategorized), or a real category id.
export async function addTransaction(draft: TxnDraft): Promise<boolean> {
  const { budgetId } = await requireBudget("write");
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return false;
  const memo = (draft.memo || "").trim();

  if (draft.categoryId.startsWith("transfer:")) {
    // A transfer's direction is already fully expressed by which account is picked as source
    // vs. destination — allowing a negative amount here (unlike a normal transaction, where
    // it deliberately means "refund/inflow") only lets a same-signed pair of legs get flipped,
    // which buildActivityByMonth's `amountCents > 0 = payment` check would then misread as a
    // payment landing on a card that actually just took on more debt.
    if (cents <= 0) return false;
    const toId = draft.categoryId.slice(9);
    if (!toId || toId === draft.accountId) return false;
    // Both legs must be accounts in the active budget.
    const [fromAcct, toAcct] = await Promise.all([
      prisma.account.findFirst({ where: { id: draft.accountId, budgetId } }),
      prisma.account.findFirst({ where: { id: toId, budgetId } }),
    ]);
    if (!fromAcct || !toAcct) return false;
    const transferId = uid("xfer");
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          budgetId,
          accountId: draft.accountId,
          date: draft.date,
          // Never displayed — the register derives "Transfer to/from <name>" live from
          // counterpartAccountId (see transferLabel in src/lib/budget.ts) instead of baking in
          // a name here that would go stale if the account were ever renamed.
          payee: "",
          kind: "TRANSFER",
          categoryId: null,
          amountCents: -cents,
          cleared: false,
          memo,
          transferId,
          counterpartAccountId: toId,
        },
      }),
      prisma.transaction.create({
        data: {
          budgetId,
          accountId: toId,
          date: draft.date,
          payee: "",
          kind: "TRANSFER",
          categoryId: null,
          amountCents: cents,
          cleared: false,
          memo,
          transferId,
          counterpartAccountId: draft.accountId,
        },
      }),
    ]);
  } else if (draft.categoryId === "income") {
    const acct = await prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true } });
    if (!acct) return false;
    await prisma.transaction.create({
      data: {
        budgetId,
        accountId: draft.accountId,
        date: draft.date,
        payee: draft.payee.trim() || "Income",
        kind: "INCOME",
        categoryId: null,
        amountCents: cents,
        cleared: false,
        memo,
      },
    });
  } else {
    const acct = await prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true } });
    if (!acct) return false;
    if (draft.categoryId && (await isPaymentCategory(draft.categoryId, budgetId))) return false;
    const categoryId = draft.categoryId || null;
    // A manually-added transaction is created already-approved (pending: false), so hold it to the
    // same rule as approving an import (see updateTransaction): a NORMAL transaction needs a
    // category. INCOME/TRANSFER take the branches above and are exempt.
    if (categoryId === null) return false;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          budgetId,
          accountId: draft.accountId,
          date: draft.date,
          payee: draft.payee.trim() || "Payee",
          kind: "NORMAL",
          categoryId,
          amountCents: -cents,
          cleared: false,
          memo,
        },
      });
      await applyOverspendCoverage(tx, budgetId, draft.accountId, categoryId, draft.date);
    });
  }
  revalidateAll();
  return true;
}

// Ports updateTxn (ynab-clone.jsx lines 598-611). Editing a transaction into/out of a
// transfer isn't supported, matching the original (TxnEditorRow disables allowTransfer
// when editing — ynab-clone.jsx line 672).
export async function updateTransaction(id: string, draft: TxnDraft): Promise<boolean> {
  const { budgetId } = await requireBudget("write");
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return false;
  const memo = (draft.memo || "").trim();

  // The edited row and its new account must both belong to the active budget.
  const [owned, acct] = await Promise.all([
    prisma.transaction.findFirst({ where: { id, budgetId }, select: { id: true } }),
    prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true } }),
  ]);
  if (!owned || !acct) return false;

  if (draft.categoryId === "income") {
    await prisma.transaction.update({
      where: { id },
      data: {
        date: draft.date,
        accountId: draft.accountId,
        memo,
        kind: "INCOME",
        categoryId: null,
        amountCents: cents,
        payee: draft.payee.trim() || "Income",
        // Saving an edit is how a file-imported (pending) row gets reviewed — this save IS
        // the approval. A no-op for already-approved transactions.
        pending: false,
      },
    });
  } else {
    if (draft.categoryId && (await isPaymentCategory(draft.categoryId, budgetId))) return false;
    const categoryId = draft.categoryId || null;
    // Saving is how a pending import gets approved (pending -> false), so a NORMAL transaction
    // must have a category to be saved: approving an uncategorized purchase would leave money
    // that never shows up against any budget category. INCOME/TRANSFER take the branches above
    // and are intentionally categoryId: null, so they're unaffected. Mirrors the same rule the
    // uncleared->cleared gate enforces in toggleCleared.
    if (categoryId === null) return false;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          date: draft.date,
          accountId: draft.accountId,
          memo,
          kind: "NORMAL",
          categoryId,
          amountCents: -cents,
          payee: draft.payee.trim() || "Payee",
          pending: false,
        },
      });
      await applyOverspendCoverage(tx, budgetId, draft.accountId, categoryId, draft.date);
    });
  }
  revalidateAll();
  return true;
}

// Bulk-approve pending imported rows that already have a category (accepting the auto-guesses):
// clears `pending` and runs the same overspend coverage a single-row save (updateTransaction) does.
// Budget-scoped; uncategorized, already-approved, or other-budget ids are ignored. Returns the count.
export async function approvePending(ids: string[]): Promise<{ approved: number }> {
  const { budgetId } = await requireBudget("write");
  if (ids.length === 0) return { approved: 0 };
  const rows = await prisma.transaction.findMany({
    where: { id: { in: ids }, budgetId, pending: true, categoryId: { not: null } },
    select: { id: true, accountId: true, categoryId: true, date: true },
  });
  if (rows.length === 0) return { approved: 0 };
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.transaction.update({ where: { id: r.id }, data: { pending: false } });
      await applyOverspendCoverage(tx, budgetId, r.accountId, r.categoryId, r.date);
    }
  });
  revalidateAll();
  return { approved: rows.length };
}

export type ToggleClearedResult = { ok: true } | { ok: false; reason: string };

// Every approved (cleared) transaction needs a category — otherwise a credit card purchase
// (or any spending) can sit there uncategorized indefinitely, never showing up against any
// budget category, including a card's payment category. Only blocks the uncleared->cleared
// transition on a plain NORMAL transaction with no category; INCOME and TRANSFER legs are
// intentionally always categoryId: null and are unaffected (kind !== "NORMAL" short-circuits).
export async function toggleCleared(id: string): Promise<ToggleClearedResult> {
  const { budgetId } = await requireBudget("write");
  const t = await prisma.transaction.findFirst({ where: { id, budgetId } });
  if (!t) return { ok: false, reason: "Transaction not found." };

  const willClear = !t.cleared;
  if (willClear && t.pending) {
    return { ok: false, reason: "Approve this imported transaction before marking it cleared." };
  }
  if (willClear && t.kind === "NORMAL" && t.categoryId === null) {
    return { ok: false, reason: "Add a category before marking this transaction cleared." };
  }

  await prisma.transaction.update({ where: { id }, data: { cleared: willClear } });
  revalidateAll();
  return { ok: true };
}

// Reconciliation is only permitted once every transaction on the account is cleared and
// approved — no auto-clearing on our side, and no partial reconciliation. The user has to
// manually clear (or delete) everything uncleared, and review every pending (file-imported)
// row, first; shared by getReconcileInfo (the pre-check that gates opening the modal) and
// reconcileAccount (which re-checks server-side rather than trusting that nothing changed
// between opening the modal and saving it).
async function reconcileEligibility(budgetId: string, accountId: string) {
  const transactions = await prisma.transaction.findMany({ where: { budgetId, accountId, deletedAt: null } });
  const unclearedCount = transactions.filter((t) => !t.cleared).length;
  const pendingCount = transactions.filter((t) => t.pending).length;
  return { transactions, unclearedCount, pendingCount };
}

function blockingReason(unclearedCount: number, pendingCount: number): string | null {
  if (pendingCount > 0) {
    return `Approve every imported transaction before reconciling — ${pendingCount} pending.`;
  }
  if (unclearedCount > 0) {
    return `Clear every transaction before reconciling — ${unclearedCount} transaction${unclearedCount > 1 ? "s are" : " is"} still uncleared.`;
  }
  return null;
}

export type ReconcileCheck = { ok: true; currentBalanceCents: number } | { ok: false; reason: string };

export async function getReconcileInfo(accountId: string): Promise<ReconcileCheck> {
  const { budgetId } = await requireBudget("read");
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId }, select: { id: true } });
  if (!account) return { ok: false, reason: "Account not found." };
  const { transactions, unclearedCount, pendingCount } = await reconcileEligibility(budgetId, accountId);
  const reason = blockingReason(unclearedCount, pendingCount);
  if (reason) return { ok: false, reason };
  return { ok: true, currentBalanceCents: transactions.reduce((s, t) => s + t.amountCents, 0) };
}

export type ReconcileResult = { ok: true; adjustmentCents: number } | { ok: false; reason: string };

// Never auto-clears anything and never partially reconciles — if the account isn't fully
// cleared this just refuses and explains why. Once eligible, creates a Reconciliation record
// EVERY time (this is the audit trail — a clean reconciliation with no discrepancy used to
// leave zero trace anywhere), plus a single adjustment transaction (already cleared, dated as
// of "now") only when the statement balance actually differs from the tracked one.
export async function reconcileAccount(accountId: string, actualBalance: string): Promise<ReconcileResult> {
  const { budgetId } = await requireBudget("write");
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId } });
  if (!account) return { ok: false, reason: "Account not found." };

  const { transactions, unclearedCount, pendingCount } = await reconcileEligibility(budgetId, accountId);
  const reason = blockingReason(unclearedCount, pendingCount);
  if (reason) return { ok: false, reason };

  const currentBalanceCents = transactions.reduce((s, t) => s + t.amountCents, 0);
  const actualCents = parseMoney(actualBalance);
  const diff = actualCents - currentBalanceCents;
  const today = new Date().toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    let adjustmentTransactionId: string | null = null;
    if (diff !== 0) {
      // Matches addAccount's starting-balance convention: a positive adjustment is income
      // unless the account is a credit card (where a positive difference just means less debt
      // than tracked, not new income).
      const isIncome = diff > 0 && account.type !== "CREDIT";
      const adjustment = await tx.transaction.create({
        data: {
          budgetId,
          accountId,
          date: today,
          payee: "Reconciliation Adjustment",
          kind: isIncome ? "INCOME" : "NORMAL",
          categoryId: null,
          amountCents: diff,
          cleared: true,
          memo: "",
        },
      });
      adjustmentTransactionId = adjustment.id;
    }
    await tx.reconciliation.create({
      data: { budgetId, accountId, date: today, statementBalanceCents: actualCents, adjustmentCents: diff, adjustmentTransactionId },
    });
  });

  revalidateAll();
  return { ok: true, adjustmentCents: diff };
}

// Ports del (ynab-clone.jsx lines 556-560) — deletes both legs of a transfer together. Soft
// delete (sets deletedAt rather than removing the row) so a transaction's externalId — if it
// came from a QFX import — keeps blocking re-import of that same bank transaction forever,
// rather than the delete freeing it up to silently reappear on the next overlapping import.
export async function deleteTransaction(id: string) {
  const { budgetId } = await requireBudget("write");
  const t = await prisma.transaction.findFirst({ where: { id, budgetId } });
  if (!t) return;
  const deletedAt = new Date();
  // Scope by budgetId as well as transferId so a caller can't soft-delete rows outside the budget.
  if (t.transferId) await prisma.transaction.updateMany({ where: { budgetId, transferId: t.transferId }, data: { deletedAt } });
  else await prisma.transaction.update({ where: { id }, data: { deletedAt } });
  revalidateAll();
}

// Ports AccountModal's save (ynab-clone.jsx lines 899-912): a positive starting balance
// becomes income (unless the account is a credit card), a negative or zero balance doesn't.
// Invariant 1 (DB half): a new on-budget CREDIT account gets exactly one linked payment
// category in the (per-budget) hidden "Credit Card Payments" group, created/found in the same
// transaction. The pure "what should it look like" decision lives in buildPaymentCategoryDraft
// (src/lib/budget.ts, unit-tested); this just persists it.
export async function addAccount(input: { name: string; type: AccountType; balance: string }) {
  const { budgetId } = await requireBudget("write");
  const name = input.name.trim();
  if (!name) return;
  // Investment/Loan are off-budget tracking accounts: their balance counts toward net worth, but
  // their transactions stay out of the budget (see the offBudget filter in computeDerived).
  const offBudget = input.type === "INVESTMENT" || input.type === "LOAN";
  // A loan's balance is the amount owed — store it negative (a liability) regardless of sign entered.
  const cents = input.type === "LOAN" ? -Math.abs(parseMoney(input.balance)) : parseMoney(input.balance);
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({ data: { budgetId, name, type: input.type, onBudget: !offBudget } });
    if (cents !== 0) {
      // On-budget positive opening balance is assignable income; a tracking account's balance is not.
      const isIncome = cents > 0 && !offBudget && input.type !== "CREDIT";
      await tx.transaction.create({
        data: {
          budgetId,
          accountId: account.id,
          date: `${curYM()}-01`,
          payee: "Starting Balance",
          kind: isIncome ? "INCOME" : "NORMAL",
          categoryId: null,
          amountCents: cents,
          cleared: true,
          memo: "",
        },
      });
    }
    if (input.type === "CREDIT") {
      // The hidden "Credit Card Payments" group is per-budget now (a fixed global id can't be
      // shared across budgets), so find this budget's group by its marker and create it if absent.
      // Runs inside the surrounding $transaction; the only race is two credit accounts added to the
      // same budget concurrently, which is rare and at worst yields a duplicate hidden group.
      const hiddenGroup =
        (await tx.categoryGroup.findFirst({ where: { budgetId, isHidden: true, name: PAYMENT_GROUP_NAME } })) ??
        (await tx.categoryGroup.create({ data: { budgetId, name: PAYMENT_GROUP_NAME, isHidden: true } }));
      const draft = buildPaymentCategoryDraft(account);
      await tx.category.create({ data: { budgetId, groupId: hiddenGroup.id, name: draft.name, linkedAccountId: draft.linkedAccountId } });
    }
  });
  revalidateAll();
}

const REQUIRED_IMPORT_HEADERS = ["date", "payee", "amount"];

type ImportRow = { date: string; payee: string; memo: string; amountCents: number; externalId: string | null };

// Generic CSV (Date, Payee, Amount, Memo — no account column, one file per account). Every row
// gets a synthesized fingerprint as its externalId (see csvFingerprint in src/lib/csv.ts) so
// re-importing an overlapping export doesn't re-insert rows already present.
function parseCsvImport(csvText: string): { rows: ImportRow[]; skipped: number } | { error: string } {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const missing = REQUIRED_IMPORT_HEADERS.filter((h) => colIndex(h) === -1);
  if (missing.length > 0) {
    return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  }
  const dateCol = colIndex("date");
  const payeeCol = colIndex("payee");
  const amountCol = colIndex("amount");
  const memoCol = colIndex("memo");

  const parsed: ImportRow[] = [];
  let skipped = 0;
  for (const raw of rows.slice(1)) {
    const date = normalizeDate(raw[dateCol] || "");
    const amountCents = parseMoney(raw[amountCol] || "");
    if (!date || !amountCents) {
      skipped++;
      continue;
    }
    const payee = (raw[payeeCol] || "").trim() || "Payee";
    const memo = memoCol === -1 ? "" : (raw[memoCol] || "").trim();
    parsed.push({ date, payee, memo, amountCents, externalId: csvFingerprint(date, payee, amountCents, memo) });
  }
  return { rows: parsed, skipped };
}

// Generic CSV or QFX/OFX (Quicken) import — format is detected from the file's own content
// (see isQfx in src/lib/qfx.ts), not its extension. Every row lands as pending: uncategorized,
// unapproved, and uncleared, but its amount is already reflected in the account's balance (see
// the `pending` field's doc comment in schema.prisma). A user reviews and approves each one
// individually by opening and saving it in the register — the same edit flow every other
// transaction uses (see updateTransaction).
//
// QFX rows carry the bank's own FITID as externalId; CSV rows carry a synthesized content
// fingerprint (csvFingerprint in src/lib/csv.ts). Either way, rows whose externalId already
// exists for the account are skipped (see the pre-filter below), so re-importing a file with an
// overlapping date range — the normal way both banks and Quicken let you export — is a no-op for
// rows already present, instead of creating duplicate pending transactions.
export async function importTransactions(accountId: string, fileText: string): Promise<ImportResult> {
  const { budgetId } = await requireBudget("write");
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId } });
  if (!account) return { ok: false, reason: "Account not found." };

  let parsed: ImportRow[];
  let skipped: number;
  if (isQfx(fileText)) {
    const result = parseQfx(fileText);
    if (result.rows.length === 0) return { ok: false, reason: "No transactions found in this QFX file." };
    parsed = result.rows;
    skipped = result.skipped;
  } else {
    const result = parseCsvImport(fileText);
    if ("error" in result) return { ok: false, reason: result.error };
    parsed = result.rows;
    skipped = result.skipped;
  }
  if (parsed.length === 0) return { ok: false, reason: "No valid rows found in the file." };

  // createMany's `skipDuplicates` is a Postgres/MySQL-only Prisma feature — it throws on SQLite
  // (the Electron desktop build). So instead of leaning on the DB to drop rows that collide with
  // the (accountId, externalId) unique constraint, pre-filter here: skip any row whose externalId
  // already exists for this account (INCLUDING soft-deleted rows — they keep occupying their slot
  // on purpose, so a deleted transaction can't silently reappear on re-import; see deleteTransaction)
  // and any duplicate within this same file. Rows with a null externalId (e.g. a QFX row missing its
  // FITID) never collide in a unique constraint, so they're always inserted — matching how
  // skipDuplicates behaved. Works identically on Postgres and SQLite.
  const existing = await prisma.transaction.findMany({ where: { budgetId, accountId }, select: { externalId: true } });
  const seen = new Set<string>();
  for (const t of existing) if (t.externalId) seen.add(t.externalId);

  const toInsert = parsed.filter((r) => {
    if (r.externalId === null) return true;
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });

  // Guess a category for each imported (still-pending) row from the user's own history plus a
  // static seed of common merchants — a *suggestion* only: the row stays pending, so the guess
  // never counts against a budget until the user reviews and approves it (see updateTransaction).
  // History = every already-categorized transaction (this budget), majority-voted per merchant.
  const categorized = await prisma.transaction.findMany({
    where: { budgetId, deletedAt: null, kind: "NORMAL", categoryId: { not: null } },
    select: { payee: true, memo: true, categoryId: true },
  });
  const history = buildHistoryMap(categorized);
  // Resolve the KNOWN_MERCHANTS name->category seed to this budget's category ids (skip a payment
  // category or a name the user doesn't have). Non-payment categories only — a card's payment
  // category is never a transaction's own categoryId (see isPaymentCategory).
  const cats = await prisma.category.findMany({ where: { budgetId, linkedAccountId: null }, select: { id: true, name: true } });
  const idByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const seed = KNOWN_MERCHANTS.map((k) => ({ match: k.match, categoryId: idByName.get(k.category.toLowerCase()) }))
    .filter((s): s is { match: string; categoryId: string } => Boolean(s.categoryId));

  const CHUNK = 500;
  let importedCount = 0;
  let guessedCount = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await prisma.transaction.createMany({
      data: chunk.map((r) => {
        const categoryId = guessCategoryId(r.payee, r.memo, r.amountCents, history, seed);
        if (categoryId) guessedCount++;
        return {
          budgetId,
          accountId,
          date: r.date,
          payee: r.payee,
          memo: r.memo,
          kind: "NORMAL" as const,
          categoryId,
          amountCents: r.amountCents,
          cleared: false,
          pending: true,
          externalId: r.externalId,
        };
      }),
    });
    importedCount += result.count;
  }

  revalidateAll();
  return { ok: true, imported: importedCount, duplicates: parsed.length - importedCount, skipped, guessed: guessedCount };
}
