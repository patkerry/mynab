import { prisma } from "./db";
import { getActiveBudgetId, getActiveBudgetOptional } from "./budget-context";
import type { Prisma } from "@/generated/prisma-postgres/client";
import type { AccountFilter, CategoryFilter } from "./types";

// Every read here is scoped to the active budget (getActiveBudgetId): desktop resolves to the one
// local budget, web to the user's selected budget. This is the primary guard against one budget's
// data leaking into another's view — the filter is applied to every table, not just the top-level one.

// Rendered by the root layout for EVERY page — including public /login and statically-prerendered
// pages that have no session — so it tolerates no active budget by returning an empty sidebar rather
// than throwing (which would break the web build and the login page).
export async function getSidebarData() {
  const active = await getActiveBudgetOptional();
  if (!active) return { accounts: [], acctBalance: {} as Record<string, number>, netWorth: 0 };
  const budgetId = active.budgetId;
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({ where: { budgetId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null }, select: { accountId: true, amountCents: true } }),
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
  const budgetId = await getActiveBudgetId();
  const [groups, categories, transactions, budgetEntries, accounts] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { budgetId, isHidden: false }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.category.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
    prisma.account.findMany({ where: { budgetId } }),
  ]);
  return { groups, categories, transactions, budgetEntries, accounts };
}

export const ACCOUNT_TXNS_PAGE_SIZE = 50;

// "none" (Uncategorized) must match categoryId === null but only for NORMAL transactions —
// INCOME and TRANSFER rows also carry categoryId: null intentionally (INCOME replaces the
// original "income" sentinel; TRANSFER legs are never categorized), so a plain `categoryId: null`
// filter would wrongly pull income and transfers into "Uncategorized". Only a NORMAL row with no
// category is genuinely uncategorized.
export async function getAccountTransactions(filters: { accountId: AccountFilter; categoryId: CategoryFilter; page: number }) {
  const budgetId = await getActiveBudgetId();
  const where: Prisma.TransactionWhereInput = { budgetId, deletedAt: null };
  if (filters.accountId !== "all") where.accountId = filters.accountId;
  if (filters.categoryId === "income") where.kind = "INCOME";
  else if (filters.categoryId === "none") {
    where.categoryId = null;
    where.kind = "NORMAL";
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
    prisma.account.findMany({ where: { budgetId }, orderBy: { createdAt: "asc" } }),
    // Payment categories are excluded here (unlike getBudgetPageData's `categories`, which
    // needs them for computeDerived): they're never a valid categoryId for a transaction
    // (their activity is derived, not tagged — see addTransaction/updateTransaction's
    // isPaymentCategory guard), so they shouldn't appear as a selectable option in the
    // category filter or the transaction editor's category picker.
    prisma.category.findMany({ where: { budgetId, linkedAccountId: null }, orderBy: { createdAt: "asc" } }),
    // Only meaningful for a single selected account — "all accounts" has no one reconciliation
    // history to show.
    filters.accountId !== "all" ? prisma.reconciliation.findFirst({ where: { budgetId, accountId: filters.accountId }, orderBy: { createdAt: "desc" } }) : null,
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
  const budgetId = await getActiveBudgetId();
  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.category.findMany({ where: { budgetId } }),
  ]);
  return { transactions, categories };
}
