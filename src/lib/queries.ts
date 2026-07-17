import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountFilter, CategoryFilter } from "./types";

export async function getSidebarData() {
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { deletedAt: null }, select: { accountId: true, amountCents: true } }),
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
//
// `groups` excludes hidden ones (the singleton "Credit Card Payments" group) so it never gets
// a visible row in BudgetView — but `categories` is NOT filtered: the linked payment category
// it contains still has to reach computeDerived for available()/activityIn() to work.
export async function getBudgetPageData() {
  const [groups, categories, transactions, budgetEntries, accounts] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { isHidden: false }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { deletedAt: null } }),
    prisma.budgetEntry.findMany(),
    prisma.account.findMany(),
  ]);
  return { groups, categories, transactions, budgetEntries, accounts };
}

export const ACCOUNT_TXNS_PAGE_SIZE = 50;

// "none" (Uncategorized) must match categoryId === null while excluding INCOME — INCOME rows
// also carry categoryId: null (it replaces the original "income" sentinel string), so a plain
// `categoryId: null` filter would incorrectly pull income rows into "Uncategorized".
export async function getAccountTransactions(filters: { accountId: AccountFilter; categoryId: CategoryFilter; page: number }) {
  const where: Prisma.TransactionWhereInput = { deletedAt: null };
  if (filters.accountId !== "all") where.accountId = filters.accountId;
  if (filters.categoryId === "income") where.kind = "INCOME";
  else if (filters.categoryId === "none") {
    where.categoryId = null;
    where.kind = { not: "INCOME" };
  } else if (filters.categoryId !== "all") {
    where.categoryId = filters.categoryId;
  }

  const pageSize = ACCOUNT_TXNS_PAGE_SIZE;
  const skip = (filters.page - 1) * pageSize;

  const [transactions, totalCount, clearedAgg, unclearedAgg, pendingCount, accounts, categories, lastReconciliation] = await Promise.all([
    // A stable tiebreaker (createdAt) is required alongside date — many rows share a date, and
    // without one, pagination across requests wouldn't be deterministic.
    prisma.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip, take: pageSize }),
    prisma.transaction.count({ where }),
    // Cleared/uncleared/pending totals must reflect the FULL filtered set, not just the current
    // page — computed here as separate aggregate-only queries (cheap, no row materialization)
    // rather than derived client-side from a (now-paginated) transactions array.
    prisma.transaction.aggregate({ where: { ...where, cleared: true }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...where, cleared: false }, _sum: { amountCents: true } }),
    prisma.transaction.count({ where: { ...where, pending: true } }),
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    // Payment categories are excluded here (unlike getBudgetPageData's `categories`, which
    // needs them for computeDerived): they're never a valid categoryId for a transaction
    // (their activity is derived, not tagged — see addTransaction/updateTransaction's
    // isPaymentCategory guard), so they shouldn't appear as a selectable option in the
    // category filter or the transaction editor's category picker.
    prisma.category.findMany({ where: { linkedAccountId: null }, orderBy: { createdAt: "asc" } }),
    // Only meaningful for a single selected account — "all accounts" has no one reconciliation
    // history to show.
    filters.accountId !== "all" ? prisma.reconciliation.findFirst({ where: { accountId: filters.accountId }, orderBy: { createdAt: "desc" } }) : null,
  ]);
  return {
    transactions,
    totalCount,
    page: filters.page,
    pageSize,
    clearedCents: clearedAgg._sum.amountCents ?? 0,
    unclearedCents: unclearedAgg._sum.amountCents ?? 0,
    pendingCount,
    accounts,
    categories,
    lastReconciliation,
  };
}

export async function getReportsData() {
  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany({ where: { deletedAt: null } }),
    prisma.category.findMany(),
  ]);
  return { transactions, categories };
}
