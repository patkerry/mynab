"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseMoney, uid, curYM } from "@/lib/format";
import type { AccountType } from "@/generated/prisma/client";
import type { TxnDraft } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/", "layout");
}

// Ports addTxn (ynab-clone.jsx lines 575-596): categoryId is "transfer:<accountId>",
// "income", "" (uncategorized), or a real category id.
export async function addTransaction(draft: TxnDraft): Promise<boolean> {
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return false;
  const memo = (draft.memo || "").trim();

  if (draft.categoryId.startsWith("transfer:")) {
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
  });
  revalidateAll();
}
