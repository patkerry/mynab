import { prisma } from "./db";
import { getActiveBudgetId, getActiveBudgetOptional } from "./budget-context";
import { computeDerived, computePaymentCategoryBreakdown, type CatBreakdown } from "./budget";
import { addMonths } from "./format";
import type { Prisma } from "@/generated/prisma-postgres/client";
import type { AccountFilter, BudgetPageModel, CatMonth, CategoryFilter } from "./types";

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

// The /budget page's whole data story: fetch all-time rows (the engine is deliberately a pure
// function over unfiltered history — see budget.ts), run computeDerived server-side, and return
// a plain serializable model. derived.available() etc. are closures that can't cross the
// Server->Client boundary, which is why the numbers are flattened per category here.
//
// `groups` excludes hidden ones (the singleton "Credit Card Payments" group) so it never gets
// a visible row in BudgetView — but `categories` is NOT filtered: the linked payment category
// it contains still has to reach computeDerived for available()/activityIn() to work.
export async function getBudgetPageModel(month: string) {
  const budgetId = await getActiveBudgetId();
  const [groups, categories, transactions, budgetEntries, accounts, splits] = await Promise.all([
    prisma.categoryGroup.findMany({ where: { budgetId, isHidden: false }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.category.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
    prisma.account.findMany({ where: { budgetId } }),
    prisma.transactionSplit.findMany({ where: { budgetId, transaction: { deletedAt: null } } }),
  ]);

  // The engine runs HERE, server-side, and only the per-category numbers cross the wire.
  // (This function used to return the raw rows and BudgetView ran computeDerived client-side —
  // which meant serializing the entire transaction history into the RSC payload on every render
  // and re-scanning it in the browser on every month click. O(all-time rows) per navigation.)
  const inputs = { accounts, categories, transactions, budgetEntries, splits };
  const derived = computeDerived(inputs, month);
  const lastMonth = addMonths(month, -1);

  const rows: Record<string, CatMonth> = {};
  for (const c of categories) {
    rows[c.id] = {
      assigned: derived.assignedIn(c.id, month),
      activity: derived.activityIn(c.id, month),
      avail: derived.available(c.id, month),
      lastAssigned: derived.assignedIn(c.id, lastMonth),
    };
  }

  // Payment-category transparency breakdowns, names resolved server-side (the raw breakdown
  // carries source category/account ids; the view only needs display strings + amounts).
  const breakdowns: Record<string, CatBreakdown> = {};
  for (const c of categories) {
    if (!c.linkedAccountId) continue;
    const raw = computePaymentCategoryBreakdown(inputs, c.id, month);
    if (!raw) continue;
    breakdowns[c.id] = {
      sources: raw.breakdown.map((b) =>
        "sourceCategoryId" in b
          ? { name: categories.find((x) => x.id === b.sourceCategoryId)?.name || "?", amount: b.amount }
          : { name: `Transfer from ${accounts.find((a) => a.id === b.sourceAccountId)?.name || "?"}`, amount: b.amount }
      ),
      paymentsTotal: raw.payments.reduce((s, p) => s + p.amount, 0),
      paymentsCount: raw.payments.length,
    };
  }

  const model: BudgetPageModel = { rta: derived.readyToAssign, rows, breakdowns };
  return { groups, categories, model };
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

  const [transactions, totalCount, stateBuckets, accounts, categories, lastReconciliation] = await Promise.all([
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
    // page. ONE grouped aggregate replaces what used to be four separate scans of the filtered
    // set: grouping by (cleared, pending) yields every bucket the header needs. The buckets are
    // the register-state axes from register.ts (isUncleared / isPending) — imported rows land
    // cleared:true+pending:true, so the pending buckets never overlap the cleared:false ones and
    // the header can sum uncleared + pending without double-counting.
    prisma.transaction.groupBy({ by: ["cleared", "pending"], where, _sum: { amountCents: true }, _count: { _all: true } }),
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
  const bucketSum = (pred: (b: { cleared: boolean; pending: boolean }) => boolean) =>
    stateBuckets.filter(pred).reduce((s, b) => s + (b._sum.amountCents ?? 0), 0);
  return {
    transactions,
    totalCount,
    page: filters.page,
    pageSize,
    clearedCents: bucketSum((b) => b.cleared),
    unclearedCents: bucketSum((b) => !b.cleared),
    pendingCount: stateBuckets.filter((b) => b.pending).reduce((s, b) => s + b._count._all, 0),
    pendingCents: bucketSum((b) => b.pending),
    accounts,
    categories,
    lastReconciliation,
  };
}

// `fromDate` ("YYYY-MM-DD", the report window's first day) bounds the row fetch — every report
// filters to the window anyway, so rows before it were fetched only to be discarded. The one
// cumulative report (netWorthTrend) gets the pre-window history as a single SQL SUM baseline.
export async function getReportsData(fromDate: string) {
  const budgetId = await getActiveBudgetId();
  const [transactions, categories, budgetEntries, accounts, splits, baselineAgg] = await Promise.all([
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null, date: { gte: fromDate } } }),
    prisma.category.findMany({ where: { budgetId } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
    prisma.account.findMany({ where: { budgetId } }),
    prisma.transactionSplit.findMany({ where: { budgetId, transaction: { deletedAt: null, date: { gte: fromDate } } } }),
    prisma.transaction.aggregate({ where: { budgetId, deletedAt: null, date: { lt: fromDate } }, _sum: { amountCents: true } }),
  ]);
  return { transactions, categories, budgetEntries, accounts, splits, baselineCents: baselineAgg._sum.amountCents ?? 0 };
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
