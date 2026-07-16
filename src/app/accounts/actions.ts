"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseMoney, uid, curYM } from "@/lib/format";
import { PAYMENT_GROUP_ID, PAYMENT_GROUP_NAME, buildPaymentCategoryDraft } from "@/lib/budget";
import type { AccountType } from "@/generated/prisma/client";
import type { TxnDraft } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/", "layout");
}

// A payment category's activity is entirely derived from its linked card's transactions
// (see computeDerived/buildActivityByMonth in src/lib/budget.ts) — it must never be the direct
// categoryId of a transaction. Tagging one directly would double-count against the derived
// contribution and cancel to a net-zero effect on every category, silently discarding that
// transaction's budget impact. Checked server-side (not just hidden from the UI picker) so
// this can't be bypassed by calling the action directly.
async function isPaymentCategory(categoryId: string): Promise<boolean> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { linkedAccountId: true } });
  return category?.linkedAccountId != null;
}

// Ports addTxn (ynab-clone.jsx lines 575-596): categoryId is "transfer:<accountId>",
// "income", "" (uncategorized), or a real category id.
export async function addTransaction(draft: TxnDraft): Promise<boolean> {
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
    const [fromAcct, toAcct] = await Promise.all([
      prisma.account.findUnique({ where: { id: draft.accountId } }),
      prisma.account.findUnique({ where: { id: toId } }),
    ]);
    if (!fromAcct || !toAcct) return false;
    const transferId = uid("xfer");
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId: draft.accountId,
          date: draft.date,
          payee: `Transfer to ${toAcct.name}`,
          kind: "TRANSFER",
          categoryId: null,
          amountCents: -cents,
          cleared: false,
          memo,
          transferId,
        },
      }),
      prisma.transaction.create({
        data: {
          accountId: toId,
          date: draft.date,
          payee: `Transfer from ${fromAcct.name}`,
          kind: "TRANSFER",
          categoryId: null,
          amountCents: cents,
          cleared: false,
          memo,
          transferId,
        },
      }),
    ]);
  } else if (draft.categoryId === "income") {
    await prisma.transaction.create({
      data: {
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
    if (draft.categoryId && (await isPaymentCategory(draft.categoryId))) return false;
    await prisma.transaction.create({
      data: {
        accountId: draft.accountId,
        date: draft.date,
        payee: draft.payee.trim() || "Payee",
        kind: "NORMAL",
        categoryId: draft.categoryId || null,
        amountCents: -cents,
        cleared: false,
        memo,
      },
    });
  }
  revalidateAll();
  return true;
}

// Ports updateTxn (ynab-clone.jsx lines 598-611). Editing a transaction into/out of a
// transfer isn't supported, matching the original (TxnEditorRow disables allowTransfer
// when editing — ynab-clone.jsx line 672).
export async function updateTransaction(id: string, draft: TxnDraft): Promise<boolean> {
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return false;
  const memo = (draft.memo || "").trim();

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
      },
    });
  } else {
    if (draft.categoryId && (await isPaymentCategory(draft.categoryId))) return false;
    await prisma.transaction.update({
      where: { id },
      data: {
        date: draft.date,
        accountId: draft.accountId,
        memo,
        kind: "NORMAL",
        categoryId: draft.categoryId || null,
        amountCents: -cents,
        payee: draft.payee.trim() || "Payee",
      },
    });
  }
  revalidateAll();
  return true;
}

export async function toggleCleared(id: string) {
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) return;
  await prisma.transaction.update({ where: { id }, data: { cleared: !t.cleared } });
  revalidateAll();
}

// Ports del (ynab-clone.jsx lines 556-560) — deletes both legs of a transfer together.
export async function deleteTransaction(id: string) {
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) return;
  if (t.transferId) await prisma.transaction.deleteMany({ where: { transferId: t.transferId } });
  else await prisma.transaction.delete({ where: { id } });
  revalidateAll();
}

// Ports AccountModal's save (ynab-clone.jsx lines 899-912): a positive starting balance
// becomes income (unless the account is a credit card), a negative or zero balance doesn't.
// Invariant 1 (DB half): a new on-budget CREDIT account gets exactly one linked payment
// category in the singleton hidden "Credit Card Payments" group, created/found in the same
// transaction. The pure "what should it look like" decision lives in buildPaymentCategoryDraft
// (src/lib/budget.ts, unit-tested); this just persists it.
export async function addAccount(input: { name: string; type: AccountType; balance: string }) {
  const name = input.name.trim();
  if (!name) return;
  const cents = parseMoney(input.balance);
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({ data: { name, type: input.type, onBudget: true } });
    if (cents !== 0) {
      const isIncome = cents > 0 && input.type !== "CREDIT";
      await tx.transaction.create({
        data: {
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
      // Upsert on a fixed, well-known id (matching the backfill migration's convention)
      // instead of findFirst-then-create — that pattern raced under concurrent requests since
      // nothing constrains `isHidden` to at most one true row. Upserting on the id's own
      // uniqueness is atomic regardless of concurrency.
      const hiddenGroup = await tx.categoryGroup.upsert({
        where: { id: PAYMENT_GROUP_ID },
        update: {},
        create: { id: PAYMENT_GROUP_ID, name: PAYMENT_GROUP_NAME, isHidden: true },
      });
      const draft = buildPaymentCategoryDraft(account);
      await tx.category.create({ data: { groupId: hiddenGroup.id, name: draft.name, linkedAccountId: draft.linkedAccountId } });
    }
  });
  revalidateAll();
}
