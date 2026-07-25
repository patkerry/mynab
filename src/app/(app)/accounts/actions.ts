"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireBudget } from "@/lib/budget-context";
import { parseMoney, uid, curYM, monthKeyOf, todayLocal } from "@/lib/format";
import { PAYMENT_GROUP_NAME, buildPaymentCategoryDraft, computeOverspendCoverage } from "@/lib/budget";
import { validateSplitDraft, splitsSumToParent, type ParsedSplitLine } from "@/lib/splits";
import { interpretDraft } from "@/lib/draft";
import { runImport } from "@/lib/import";
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

// Applies computeOverspendCoverage (src/lib/budget.ts): if a transaction was a credit card
// purchase that pushed its category negative, auto-assign the shortfall from Ready-to-Assign —
// same mechanism a manual assignment uses (upsert a BudgetEntry), just auto-triggered. Only
// fires for CREDIT accounts with a real categoryId; cash overspending is untouched. Must run
// inside the same `tx` as the transaction write so it sees it when re-fetching current state.
//
// Batched: the budget snapshot is fetched ONCE and the sequential drain-RTA semantics are
// preserved by applying each item's coverage to the in-memory budgetEntries before computing the
// next (the per-item computeOverspendCoverage used to re-fetch the entire budget — 2 full table
// scans per item, which made approving a 50-row card import ~100 full scans in one transaction).
async function applyOverspendCoverageBatch(
  tx: Prisma.TransactionClient,
  budgetId: string,
  items: { accountId: string; categoryId: string; date: string }[]
) {
  if (items.length === 0) return;
  const accounts = await tx.account.findMany({ where: { budgetId } });
  const creditIds = new Set(accounts.filter((a) => a.type === "CREDIT").map((a) => a.id));
  const applicable = items.filter((i) => creditIds.has(i.accountId));
  if (applicable.length === 0) return;

  const [categories, transactions, budgetEntries, splits] = await Promise.all([
    tx.category.findMany({ where: { budgetId } }),
    tx.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    tx.budgetEntry.findMany({ where: { budgetId } }),
    tx.transactionSplit.findMany({ where: { budgetId, transaction: { deletedAt: null } } }),
  ]);
  // Mutable copy: each applied coverage must be visible to the next item's computation (coverage
  // is capped by remaining RTA, and repeat categories must not double-cover).
  const entries = [...budgetEntries];
  for (const item of applicable) {
    const month = monthKeyOf(item.date);
    const coverage = computeOverspendCoverage({ accounts, categories, transactions, budgetEntries: entries, splits }, item.categoryId, month);
    if (coverage <= 0) continue;
    const existing = entries.find((e) => e.categoryId === item.categoryId && e.yearMonth === month);
    if (existing) existing.amountCents += coverage;
    else {
      entries.push({ id: uid("be"), budgetId, categoryId: item.categoryId, yearMonth: month, amountCents: coverage, createdAt: new Date(), updatedAt: new Date() });
    }
    await tx.budgetEntry.upsert({
      where: { categoryId_yearMonth: { categoryId: item.categoryId, yearMonth: month } },
      update: { amountCents: { increment: coverage } },
      create: { budgetId, categoryId: item.categoryId, yearMonth: month, amountCents: coverage },
    });
  }
}

// Single-item convenience wrapper (add/update of an unsplit transaction).
async function applyOverspendCoverage(tx: Prisma.TransactionClient, budgetId: string, accountId: string, categoryId: string | null, date: string) {
  if (!categoryId) return;
  await applyOverspendCoverageBatch(tx, budgetId, [{ accountId, categoryId, date }]);
}

// Server-side half of split validation: resolve the draft's account type and the budget's
// category sets, then defer every rule to the pure validateSplitDraft (src/lib/splits.ts) —
// the SAME function the editor runs client-side, so the server can't accept what the UI would
// reject (or vice versa). Category ids are fetched budget-scoped, which doubles as the guard
// against probing another budget's categories by id. Distinct non-null line categories are
// what the overspend-coverage loops iterate.
async function resolveSplitValidation(
  budgetId: string,
  draft: TxnDraft
): Promise<{ ok: true; lines: ParsedSplitLine[]; totalCents: number; lineCategoryIds: string[] } | { ok: false }> {
  const account = await prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { type: true } });
  if (!account) return { ok: false };
  const cats = await prisma.category.findMany({ where: { budgetId }, select: { id: true, linkedAccountId: true } });
  const v = validateSplitDraft({
    lines: draft.splits ?? [],
    direction: draft.splitDirection ?? "outflow",
    parentAmount: draft.amount,
    accountType: account.type,
    paymentCategoryIds: new Set(cats.filter((c) => c.linkedAccountId != null).map((c) => c.id)),
    validCategoryIds: new Set(cats.filter((c) => c.linkedAccountId == null).map((c) => c.id)),
  });
  if (!v.ok) return { ok: false };
  const lineCategoryIds = [...new Set(v.lines.map((l) => l.categoryId).filter((c): c is string => c !== null))];
  return { ok: true, lines: v.lines, totalCents: v.totalCents, lineCategoryIds };
}

export type PossibleDuplicate = { date: string; payee: string; amountCents: number };

// Advisory-only check, called by the "Add transaction" UI before it saves — never blocks by
// itself, just gives the caller enough to warn the user with a confirm/override. Scoped to
// same account + date + payee (case-insensitive) + signed amount; transfers are skipped since
// their payee ("Transfer to X") is synthesized, not user-typed, and two legitimate transfers
// between the same accounts on the same day for the same amount is a real, unremarkable case.
export async function findPossibleDuplicate(draft: TxnDraft): Promise<PossibleDuplicate | null> {
  const { budgetId } = await requireBudget("read");
  const d = interpretDraft(draft);
  if (d.kind === "invalid" || d.kind === "transfer") return null;

  // Case-insensitive payee match done in JS: Prisma's `mode: "insensitive"` is Postgres-only and
  // THROWS on SQLite (the desktop build) — the e2e suite caught manual adds crashing there. Same
  // provider-portability class as the createMany({ skipDuplicates }) lesson in ARCHITECTURE.md.
  // The candidate set (same account+date+amount) is tiny, so filtering in JS costs nothing.
  const candidates = await prisma.transaction.findMany({
    where: { budgetId, accountId: draft.accountId, date: draft.date, amountCents: d.cents, deletedAt: null },
    select: { date: true, payee: true, amountCents: true },
  });
  const existing = candidates.find((t) => t.payee.toLowerCase() === d.payee.toLowerCase());
  return existing ? { date: existing.date, payee: existing.payee, amountCents: existing.amountCents } : null;
}

// Ports addTxn (ynab-clone.jsx lines 575-596). Branches on interpretDraft (src/lib/draft.ts) —
// the single, unit-tested interpreter of the categoryId sentinel string — so sign rules and
// sentinel parsing can't drift between here, updateTransaction, and the editor.
export async function addTransaction(draft: TxnDraft): Promise<boolean> {
  const { budgetId } = await requireBudget("write");
  const d = interpretDraft(draft);
  if (d.kind === "invalid") return false;
  const memo = (draft.memo || "").trim();

  if (d.kind === "transfer") {
    const toId = d.toAccountId;
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
          amountCents: -d.cents,
          cleared: true,
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
          amountCents: d.cents,
          cleared: true,
          memo,
          transferId,
          counterpartAccountId: draft.accountId,
        },
      }),
    ]);
  } else if (d.kind === "income") {
    const acct = await prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true, type: true } });
    if (!acct) return false;
    // Income directly on a credit card is the documented double-count edge the engine refuses to
    // model (see ARCHITECTURE.md): it inflates Ready to Assign AND pushes the card balance
    // positive instead of increasing the debt. The split validator already forbids RTA lines on
    // cards; the plain editor gets the same rule (mirrored client-side in TxnEditorRow).
    if (acct.type === "CREDIT") return false;
    await prisma.transaction.create({
      data: {
        budgetId,
        accountId: draft.accountId,
        date: draft.date,
        payee: d.payee,
        kind: "INCOME",
        categoryId: null,
        amountCents: d.cents,
        cleared: true,
        memo,
      },
    });
  } else if (d.kind === "split") {
    // Split: parent stays NORMAL with categoryId null; the lines (which must sum exactly to the
    // parent amount — validateSplitDraft enforces it) carry the category/RTA allocations. Checked
    // BEFORE the plain-NORMAL fallback so the "split" sentinel can never persist as a category id.
    const v = await resolveSplitValidation(budgetId, draft);
    if (!v.ok) return false;
    await prisma.$transaction(async (tx) => {
      const parent = await tx.transaction.create({
        data: {
          budgetId,
          accountId: draft.accountId,
          date: draft.date,
          payee: draft.payee.trim() || "Payee",
          kind: "NORMAL",
          categoryId: null,
          amountCents: v.totalCents,
          cleared: true,
          memo,
        },
      });
      // No skipDuplicates: SQLite doesn't support it (see the import pipeline's workaround).
      await tx.transactionSplit.createMany({
        data: v.lines.map((l) => ({ budgetId, transactionId: parent.id, categoryId: l.categoryId, amountCents: l.amountCents, memo: l.memo })),
      });
      // Same per-category coverage a single-category card purchase gets, once per line category.
      await applyOverspendCoverageBatch(
        tx,
        budgetId,
        v.lineCategoryIds.map((categoryId) => ({ accountId: draft.accountId, categoryId, date: draft.date }))
      );
    });
  } else {
    const acct = await prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true } });
    if (!acct) return false;
    if (d.categoryId && (await isPaymentCategory(d.categoryId, budgetId))) return false;
    // A manually-added transaction is created already-approved (pending: false), so hold it to the
    // same rule as approving an import (see updateTransaction): a NORMAL transaction needs a
    // category. INCOME/TRANSFER take the branches above and are exempt.
    if (d.categoryId === null) return false;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          budgetId,
          accountId: draft.accountId,
          date: draft.date,
          payee: d.payee,
          kind: "NORMAL",
          categoryId: d.categoryId,
          amountCents: d.cents,
          cleared: true,
          memo,
        },
      });
      await applyOverspendCoverage(tx, budgetId, draft.accountId, d.categoryId, draft.date);
    });
  }
  revalidateAll();
  return true;
}

// Editing a normal/pending row INTO a transfer IS supported (see the transfer branch below — it
// converts the row to a source leg and creates the linked counterpart in the destination account).
// The reverse — editing an EXISTING transfer — is still unsupported: transfer rows are delete-only
// and never open in the editor (the row onClick guard in AccountsView skips them), so this only ever
// handles normal/income/pending rows as input.
export async function updateTransaction(id: string, draft: TxnDraft): Promise<boolean> {
  const { budgetId } = await requireBudget("write");
  const d = interpretDraft(draft);
  if (d.kind === "invalid") return false;
  const memo = (draft.memo || "").trim();

  // The edited row and its new account must both belong to the active budget.
  const [owned, acct] = await Promise.all([
    prisma.transaction.findFirst({ where: { id, budgetId }, select: { id: true, pending: true, categoryId: true } }),
    prisma.account.findFirst({ where: { id: draft.accountId, budgetId }, select: { id: true, type: true } }),
  ]);
  if (!owned || !acct) return false;

  if (d.kind === "transfer") {
    // Convert this (normal/pending) row into a linked transfer: the edited row becomes the source
    // leg and a matching counterpart leg is created in the destination account — the same two-leg
    // shape addTransaction produces. One-way only: existing transfers are delete-only (never opened
    // in the editor — see the row onClick guard in AccountsView), so there's no prior counterpart to
    // reconcile here. Sign rules come from interpretDraft: positive amount, source = -cents,
    // counterpart = +cents (e.g. a "transfer to credit card" lands as a payment on the card).
    const toId = d.toAccountId;
    const toAcct = await prisma.account.findFirst({ where: { id: toId, budgetId }, select: { id: true } });
    if (!toAcct) return false;
    const transferId = uid("xfer");
    await prisma.$transaction([
      // Converting a (possibly split) row into a transfer discards its split lines — a transfer
      // is never split. Same cleanup in every non-split branch below.
      prisma.transactionSplit.deleteMany({ where: { transactionId: id } }),
      prisma.transaction.update({
        where: { id },
        data: {
          date: draft.date,
          accountId: draft.accountId,
          payee: "",
          kind: "TRANSFER",
          categoryId: null,
          amountCents: -d.cents,
          memo,
          pending: false,
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
          amountCents: d.cents,
          cleared: true,
          memo,
          pending: false,
          transferId,
          counterpartAccountId: draft.accountId,
        },
      }),
    ]);
  } else if (d.kind === "income") {
    // Same credit-card rule as addTransaction: income on a card double-counts.
    if (acct.type === "CREDIT") return false;
    await prisma.$transaction([
      prisma.transactionSplit.deleteMany({ where: { transactionId: id } }),
      prisma.transaction.update({
        where: { id },
        data: {
          date: draft.date,
          accountId: draft.accountId,
          memo,
          kind: "INCOME",
          categoryId: null,
          amountCents: d.cents,
          payee: d.payee,
          // Saving an edit is how a file-imported (pending) row gets reviewed — this save IS
          // the approval. A no-op for already-approved transactions.
          pending: false,
          // Approving a pending (imported, already-posted) row also clears it — one step, not two.
          // undefined leaves cleared untouched when merely editing an already-approved row.
          cleared: owned.pending ? true : undefined,
        },
      }),
    ]);
  } else if (d.kind === "split") {
    // Split save: replace the parent's shape and its whole line set atomically. Approval-on-save
    // semantics match the plain NORMAL branch (a pending imported row can be split during review).
    const v = await resolveSplitValidation(budgetId, draft);
    if (!v.ok) return false;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          date: draft.date,
          accountId: draft.accountId,
          memo,
          kind: "NORMAL",
          categoryId: null,
          amountCents: v.totalCents,
          payee: draft.payee.trim() || "Payee",
          pending: false,
          cleared: owned.pending ? true : undefined,
        },
      });
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      await tx.transactionSplit.createMany({
        data: v.lines.map((l) => ({ budgetId, transactionId: id, categoryId: l.categoryId, amountCents: l.amountCents, memo: l.memo })),
      });
      await applyOverspendCoverageBatch(
        tx,
        budgetId,
        v.lineCategoryIds.map((categoryId) => ({ accountId: draft.accountId, categoryId, date: draft.date }))
      );
    });
  } else {
    if (d.categoryId && (await isPaymentCategory(d.categoryId, budgetId))) return false;
    // Saving is how a pending import gets approved (pending -> false), so a NORMAL transaction
    // must have a category to be saved: approving an uncategorized purchase would leave money
    // that never shows up against any budget category. ONE exception: a row that is ALREADY
    // uncategorized and already approved — starting balances and reconciliation adjustments are
    // legitimately uncategorized system rows, and without this they were permanently uneditable
    // (a real user couldn't fix a starting balance entered with the wrong sign). A categorized
    // row still can't be stripped of its category, and pending rows still require one to approve.
    if (d.categoryId === null) {
      const wasUncategorizedAndApproved = owned.categoryId === null && !owned.pending;
      if (!wasUncategorizedAndApproved) return false;
    }
    const categoryId = d.categoryId;
    await prisma.$transaction(async (tx) => {
      // Converting a split row back to a single category discards its lines.
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      await tx.transaction.update({
        where: { id },
        data: {
          date: draft.date,
          accountId: draft.accountId,
          memo,
          kind: "NORMAL",
          categoryId,
          amountCents: d.cents,
          payee: d.payee,
          pending: false,
          // Approving a pending (imported, already-posted) row also clears it — one step, not two.
          // undefined leaves cleared untouched when merely editing an already-approved row.
          cleared: owned.pending ? true : undefined,
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
  const fetched = await prisma.transaction.findMany({
    // Approvable = has a direct category, OR split lines (categorized several times over), OR is
    // imported INCOME (needs no category — approving feeds Ready to Assign).
    where: { id: { in: ids }, budgetId, pending: true, OR: [{ categoryId: { not: null } }, { splits: { some: {} } }, { kind: "INCOME" }] },
    select: { id: true, accountId: true, categoryId: true, date: true, amountCents: true, splits: { select: { categoryId: true, amountCents: true } } },
  });
  // Never approve an incoherent split: if its lines don't sum to the parent amount, approving
  // would move money into categories that never actually left the account. Every write path
  // enforces the sum, so this only skips rows some out-of-band edit corrupted — same silent-skip
  // treatment as an uncategorized row (the register's approvable predicate hides both anyway).
  const rows = fetched.filter((r) => r.splits.length === 0 || splitsSumToParent(r.amountCents, r.splits));
  if (rows.length === 0) return { approved: 0 };
  await prisma.$transaction(async (tx) => {
    // Approving also clears: a pending row is always an imported (already-posted) transaction, so
    // approving it confirms it against the bank in the same step — no separate clear click.
    await tx.transaction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { pending: false, cleared: true } });
    // Coverage per affected (row, category): the row's own category, or each distinct categorized
    // split line — one batched pass (single budget snapshot), not a re-fetch per row.
    const items = rows.flatMap((r) => {
      const catIds = r.categoryId
        ? [r.categoryId]
        : [...new Set(r.splits.map((s) => s.categoryId).filter((c): c is string => c !== null))];
      return catIds.map((categoryId) => ({ accountId: r.accountId, categoryId, date: r.date }));
    });
    await applyOverspendCoverageBatch(tx, budgetId, items);
  });
  revalidateAll();
  return { approved: rows.length };
}

// Adjusting the balance is only allowed once every imported row on the account has been reviewed:
// an unapproved import isn't counted in the balance yet, so checking against the bank before
// approving it would produce a bogus "off by X" and a wrong adjustment. (Everything is auto-cleared
// now, so there's no separate clear gate.) Shared by getReconcileInfo (gates opening the dialog) and
// reconcileAccount (re-checks server-side at submit, in case a row changed in between).
async function reconcileEligibility(budgetId: string, accountId: string) {
  const transactions = await prisma.transaction.findMany({ where: { budgetId, accountId, deletedAt: null } });
  const pendingCount = transactions.filter((t) => t.pending).length;
  return { transactions, pendingCount };
}

function blockingReason(pendingCount: number): string | null {
  if (pendingCount > 0) {
    return `Approve the ${pendingCount} pending transaction${pendingCount > 1 ? "s" : ""} first — an unreviewed import would throw off the balance.`;
  }
  return null;
}

export type ReconcileCheck = { ok: true; currentBalanceCents: number } | { ok: false; reason: string };

export async function getReconcileInfo(accountId: string): Promise<ReconcileCheck> {
  const { budgetId } = await requireBudget("read");
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId }, select: { id: true } });
  if (!account) return { ok: false, reason: "Account not found." };
  const { transactions, pendingCount } = await reconcileEligibility(budgetId, accountId);
  const reason = blockingReason(pendingCount);
  if (reason) return { ok: false, reason };
  return { ok: true, currentBalanceCents: transactions.reduce((s, t) => s + t.amountCents, 0) };
}

export type ReconcileResult = { ok: true; adjustmentCents: number } | { ok: false; reason: string };

// Snap the account to a real bank balance. Refuses if any imported row is still unreviewed (see
// reconcileEligibility). Records a Reconciliation EVERY time (the audit trail — even a clean check
// with no discrepancy is logged), plus a single visible adjustment transaction (dated "now") only
// when the entered balance actually differs from what the app has.
export async function reconcileAccount(accountId: string, actualBalance: string): Promise<ReconcileResult> {
  const { budgetId } = await requireBudget("write");
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId } });
  if (!account) return { ok: false, reason: "Account not found." };

  const { transactions, pendingCount } = await reconcileEligibility(budgetId, accountId);
  const reason = blockingReason(pendingCount);
  if (reason) return { ok: false, reason };

  const currentBalanceCents = transactions.reduce((s, t) => s + t.amountCents, 0);
  const actualCents = parseMoney(actualBalance);
  const diff = actualCents - currentBalanceCents;
  const today = todayLocal();

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

export async function renameAccount(id: string, name: string): Promise<void> {
  const { budgetId } = await requireBudget("write");
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.account.updateMany({ where: { id, budgetId }, data: { name: trimmed } });
  revalidateAll();
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: string };

// Deletes an account AND its entire history. Exists mostly for the duplicate-account case (a slow
// server + repeated Add clicks used to create dupes) — but it works on any account, so it hard-
// deletes with care for every FK the account touches:
//   - its transactions go (splits cascade with them); this frees their externalIds, which is
//     correct here — re-import dedup is scoped per account, and the account is ceasing to exist
//   - transfer legs pair via transferId across accounts: the counterpart leg in the OTHER account
//     is deleted too, so no orphaned half-transfers survive
//   - a credit card's linked payment category dies with the account (schema cascade), but its
//     BudgetEntry rows are Restrict — they're removed first, which also returns any money assigned
//     to the card back to Ready to Assign
//   - reconciliation history cascades with the account
export async function deleteAccount(id: string): Promise<DeleteAccountResult> {
  const { budgetId } = await requireBudget("manage");
  const account = await prisma.account.findFirst({ where: { id, budgetId }, select: { id: true } });
  if (!account) return { ok: false, reason: "Account not found." };

  await prisma.$transaction(async (tx) => {
    const legs = await tx.transaction.findMany({ where: { budgetId, accountId: id, transferId: { not: null } }, select: { transferId: true } });
    const transferIds = [...new Set(legs.map((t) => t.transferId).filter((x): x is string => x !== null))];
    if (transferIds.length > 0) {
      await tx.transaction.deleteMany({ where: { budgetId, transferId: { in: transferIds } } });
    }
    await tx.transaction.deleteMany({ where: { budgetId, accountId: id } });

    const payCat = await tx.category.findFirst({ where: { budgetId, linkedAccountId: id }, select: { id: true } });
    if (payCat) {
      await tx.budgetEntry.deleteMany({ where: { budgetId, categoryId: payCat.id } });
      await tx.category.delete({ where: { id: payCat.id } });
    }
    await tx.account.delete({ where: { id } });
  });
  revalidateAll();
  return { ok: true };
}

// Import CSV / QFX transactions into an account. Thin Server Action: authorize the active budget,
// delegate the parsing + guessing + insertion to runImport (src/lib/import.ts), then revalidate.
export async function importTransactions(accountId: string, fileText: string): Promise<ImportResult> {
  const { budgetId } = await requireBudget("write");
  const result = await runImport(budgetId, accountId, fileText);
  if (result.ok) revalidateAll();
  return result;
}

// Undo an import: hard-delete the still-pending rows created by one import batch (see importBatchId
// in src/lib/import.ts). Unlike deleteTransaction's soft delete, this genuinely removes them — undo
// means "that import was a mistake," so it also frees their externalIds for a clean re-import. Only
// pending rows are touched: anything the user already reviewed/approved from the batch is deliberate
// and left intact. Scoped to the active budget.
export async function undoImport(batchId: string): Promise<{ removed: number }> {
  const { budgetId } = await requireBudget("write");
  const res = await prisma.transaction.deleteMany({
    where: { budgetId, importBatchId: batchId, pending: true },
  });
  revalidateAll();
  return { removed: res.count };
}
