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
  if (!active) return { accounts: [], acctBalance: {} as Record<string, number>, netWorth: 0, readyToAssign: 0 };
  const budgetId = active.budgetId;
  // This runs on EVERY navigation (the app layout renders the sidebar), so everything here is a
  // SQL aggregate — never a findMany that materializes the whole transaction history into JS.
  const [accounts, balanceByAccount, incomeByAccount, entriesAgg, rtaSplitLines] = await Promise.all([
    prisma.account.findMany({ where: { budgetId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { budgetId, deletedAt: null },
      _sum: { amountCents: true },
    }),
    // Grouped by account so the off-budget filter below can apply in JS over a tiny result set.
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { budgetId, deletedAt: null, kind: "INCOME", pending: false },
      _sum: { amountCents: true },
    }),
    prisma.budgetEntry.aggregate({ where: { budgetId }, _sum: { amountCents: true } }),
    // Ready-to-Assign lines of split transactions (categoryId null = the income part of a split
    // deposit). Parent filters mirror the INCOME-row filters above: not deleted, not pending.
    // Splits are rare relative to transactions, so fetching the RTA lines stays cheap.
    prisma.transactionSplit.findMany({
      where: { budgetId, categoryId: null, transaction: { deletedAt: null, pending: false } },
      select: { amountCents: true, transaction: { select: { accountId: true } } },
    }),
  ]);
  const acctBalance: Record<string, number> = {};
  accounts.forEach((a) => (acctBalance[a.id] = 0));
  balanceByAccount.forEach((g) => (acctBalance[g.accountId] = g._sum.amountCents ?? 0));
  const netWorth = Object.values(acctBalance).reduce((a, b) => a + b, 0);

  // Ready-to-Assign mirrors computeDerived: totalIncome - totalAssigned, both all-time aggregates
  // (not month-scoped), so it needs no month here. Income excludes pending (unapproved) rows and
  // off-budget/tracking accounts, matching budget.ts exactly — INCLUDING the split-RTA term.
  // KEEP IN SYNC with the totalIncome computation in computeDerived (src/lib/budget.ts).
  const offBudget = new Set(accounts.filter((a) => !a.onBudget).map((a) => a.id));
  const totalIncome =
    incomeByAccount.filter((g) => !offBudget.has(g.accountId)).reduce((s, g) => s + (g._sum.amountCents ?? 0), 0) +
    rtaSplitLines.filter((l) => !offBudget.has(l.transaction.accountId)).reduce((s, l) => s + l.amountCents, 0);
  const totalAssigned = entriesAgg._sum.amountCents ?? 0;
  const readyToAssign = totalIncome - totalAssigned;

  return { accounts, acctBalance, netWorth, readyToAssign };
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
  const [groups, categories, transactions, budgetEntries, accounts, splits] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { budgetId, isHidden: false }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.category.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
    prisma.account.findMany({ where: { budgetId } }),
    prisma.transactionSplit.findMany({ where: { budgetId, transaction: { deletedAt: null } } }),
  ]);
  return { groups, categories, transactions, budgetEntries, accounts, splits };
}

// Structure-only data for the Categories management page — groups + categories in display order, no
// amounts. Visible groups only (the hidden "Credit Card Payments" group and its auto-managed payment
// categories stay off this page).
export async function getCategoriesData() {
  const budgetId = await getActiveBudgetId();
  const [groups, categories] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { budgetId, isHidden: false }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.category.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { groups, categories };
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
  // Split parents carry categoryId null, so category-shaped filters must also look at split
  // lines: "income" includes rows with an RTA line, a real id includes rows with a line in that
  // category, and "Uncategorized" must NOT match a split parent (it has categories, plural).
  if (filters.categoryId === "income") where.OR = [{ kind: "INCOME" }, { splits: { some: { categoryId: null } } }];
  else if (filters.categoryId === "none") {
    where.categoryId = null;
    where.kind = "NORMAL";
    where.splits = { none: {} };
  } else if (filters.categoryId === "pending") {
    where.pending = true; // "Needs review" — imported rows not yet approved
  } else if (filters.categoryId !== "all") {
    where.OR = [{ categoryId: filters.categoryId }, { splits: { some: { categoryId: filters.categoryId } } }];
  }

  const pageSize = ACCOUNT_TXNS_PAGE_SIZE;
  const skip = (filters.page - 1) * pageSize;

  const [transactions, totalCount, clearedAgg, unclearedAgg, pendingCount, pendingAgg, accounts, categories, lastReconciliation] = await Promise.all([
    // Order needs a TOTALLY deterministic tiebreaker. date alone ties constantly; even
    // date+createdAt ties for imported rows (a whole file's rows share one createMany timestamp),
    // and Postgres then returns tied rows in arbitrary heap order — which shifts after any update,
    // so approving/editing a row made the register visibly reshuffle. `id` (unique, immutable) as
    // the final key makes the sort stable across refreshes and pagination.
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      // The register needs each row's split lines (display + re-editing). Stable line order so
      // re-opening the editor shows lines as entered.
      include: { splits: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    }),
    prisma.transaction.count({ where }),
    // Cleared/uncleared/pending totals must reflect the FULL filtered set, not just the current
    // page — computed here as separate aggregate-only queries (cheap, no row materialization)
    // rather than derived client-side from a (now-paginated) transactions array.
    prisma.transaction.aggregate({ where: { ...where, cleared: true }, _sum: { amountCents: true } }),
    // These two WHERE filters ARE the register buckets defined in register.ts (isUncleared /
    // isPending); the header sums both as "Uncleared". Keep them in sync with that module.
    prisma.transaction.aggregate({ where: { ...where, cleared: false }, _sum: { amountCents: true } }),
    prisma.transaction.count({ where: { ...where, pending: true } }),
    // Dollar total of unapproved (imported, pending) rows. Disjoint from unclearedCents: imported
    // rows land cleared:true (see IMPORTED_TXN_STATE in register.ts), so pending rows never fall in
    // the cleared:false set — the header can sum the two without double-counting.
    prisma.transaction.aggregate({ where: { ...where, pending: true }, _sum: { amountCents: true } }),
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
    pendingCents: pendingAgg._sum.amountCents ?? 0,
    accounts,
    categories,
    lastReconciliation,
  };
}

export async function getReportsData() {
  const budgetId = await getActiveBudgetId();
  const [transactions, categories, budgetEntries, accounts, splits] = await Promise.all([
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.category.findMany({ where: { budgetId } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
    prisma.account.findMany({ where: { budgetId } }),
    prisma.transactionSplit.findMany({ where: { budgetId, transaction: { deletedAt: null } } }),
  ]);
  return { transactions, categories, budgetEntries, accounts, splits };
}

// The most recent file-import batch that still has un-reviewed (pending) rows — powers the
// "Undo last import" button. Returns null once every row in the batch has been approved or removed.
export async function getLastImportBatch(): Promise<{ id: string; count: number } | null> {
  const budgetId = await getActiveBudgetId();
  const recent = await prisma.transaction.findFirst({
    where: { budgetId, importBatchId: { not: null }, pending: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { importBatchId: true },
  });
  if (!recent?.importBatchId) return null;
  const count = await prisma.transaction.count({
    where: { budgetId, importBatchId: recent.importBatchId, pending: true, deletedAt: null },
  });
  return count > 0 ? { id: recent.importBatchId, count } : null;
}
