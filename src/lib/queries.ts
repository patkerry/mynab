import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountFilter, CategoryFilter } from "./types";

export async function getSidebarData() {
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ select: { accountId: true, amountCents: true } }),
  ]);
  const acctBalance: Record<string, number> = {};
  accounts.forEach((a) => (acctBalance[a.id] = 0));
  transactions.forEach((t) => {
    acctBalance[t.accountId] = (acctBalance[t.accountId] || 0) + t.amountCents;
  });
  const netWorth = Object.values(acctBalance).reduce((a, b) => a + b, 0);
  return { accounts, acctBalance, netWorth };
}

// Returns raw rows rather than a computed `derived` object: BudgetView must be a Client
// Component (inline-edit inputs, modal triggers), and functions like `derived.available()`
// can't cross the Server->Client prop boundary. computeDerived() runs client-side instead,
// mirroring the useMemo in the original single-file app almost exactly.
export async function getBudgetPageData() {
  const [groups, categories, transactions, budgetEntries, accounts] = await Promise.all([
    prisma.categoryGroup.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany(),
    prisma.budgetEntry.findMany(),
    prisma.account.findMany(),
  ]);
  return { groups, categories, transactions, budgetEntries, accounts };
}

// "none" (Uncategorized) must match categoryId === null while excluding INCOME — INCOME rows
// also carry categoryId: null (it replaces the original "income" sentinel string), so a plain
// `categoryId: null` filter would incorrectly pull income rows into "Uncategorized".
export async function getAccountTransactions(filters: { accountId: AccountFilter; categoryId: CategoryFilter }) {
  const where: Prisma.TransactionWhereInput = {};
  if (filters.accountId !== "all") where.accountId = filters.accountId;
  if (filters.categoryId === "income") where.kind = "INCOME";
  else if (filters.categoryId === "none") {
    where.categoryId = null;
    where.kind = { not: "INCOME" };
  } else if (filters.categoryId !== "all") {
    where.categoryId = filters.categoryId;
  }

  const [transactions, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { date: "desc" } }),
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return { transactions, accounts, categories };
}

export async function getReportsData() {
  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany(),
    prisma.category.findMany(),
  ]);
  return { transactions, categories };
}
