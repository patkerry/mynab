import { monthKeyOf } from "./format";
import type { Account, BudgetEntry, Category, Transaction } from "@/generated/prisma/client";

export type BudgetInputs = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[]; // all-time, unfiltered
  budgetEntries: BudgetEntry[]; // all-time, unfiltered
};

export type Derived = {
  acctBalance: Record<string, number>;
  assignedIn: (catId: string, ym: string) => number;
  assignedUpTo: (catId: string, ym: string) => number;
  activityIn: (catId: string, ym: string) => number;
  activityUpTo: (catId: string, ym: string) => number;
  available: (catId: string, ym: string) => number;
  readyToAssign: number;
  assignedThisMonth: number;
  netWorth: number;
  totalIncome: number;
};

// Sums a Map<month, Map<key, cents>> for every month <= ym. Shared by assignedUpTo (over
// budgetedByMonth) and activityUpTo (over activityByMonth) — same "roll forward everything
// up to and including this month" idiom either way.
function cumulativeUpTo(byMonth: Map<string, Map<string, number>>, key: string, ym: string): number {
  let s = 0;
  byMonth.forEach((entries, k) => {
    if (k <= ym) s += entries.get(key) || 0;
  });
  return s;
}

// Ports the `derived` useMemo from the original single-file app. totalIncome/totalAssigned/
// readyToAssign are genuinely all-time aggregates (not scoped to the selected month) in the
// source app, so budgetEntries/transactions must be fetched in full rather than month-bounded.
export function computeDerived(inputs: BudgetInputs, month: string): Derived {
  const { accounts, categories, transactions, budgetEntries } = inputs;

  const acctBalance: Record<string, number> = {};
  accounts.forEach((a) => (acctBalance[a.id] = 0));
  transactions.forEach((t) => {
    acctBalance[t.accountId] = (acctBalance[t.accountId] || 0) + t.amountCents;
  });

  const budgetedByMonth = new Map<string, Map<string, number>>();
  budgetEntries.forEach((b) => {
    if (!budgetedByMonth.has(b.yearMonth)) budgetedByMonth.set(b.yearMonth, new Map());
    budgetedByMonth.get(b.yearMonth)!.set(b.categoryId, b.amountCents);
  });

  // Credit-card payment categories: a category with linkedAccountId set represents "money set
  // aside to pay this card." Its activity is DERIVED rather than summed from transactions
  // tagged with its own id (see buildActivityByMonth below) — everything else about it
  // (assignedIn/assignedUpTo/available/goals) works exactly like any other category.
  const accountIdToPaymentCategoryId = new Map<string, string>();
  categories.forEach((c) => {
    if (c.linkedAccountId) accountIdToPaymentCategoryId.set(c.linkedAccountId, c.id);
  });

  const activityByMonth = buildActivityByMonth(transactions, accountIdToPaymentCategoryId);

  const assignedIn = (catId: string, ym: string) => budgetedByMonth.get(ym)?.get(catId) || 0;
  const assignedUpTo = (catId: string, ym: string) => cumulativeUpTo(budgetedByMonth, catId, ym);
  const activityIn = (catId: string, ym: string) => activityByMonth.get(ym)?.get(catId) || 0;
  const activityUpTo = (catId: string, ym: string) => cumulativeUpTo(activityByMonth, catId, ym);
  const available = (catId: string, ym: string) => assignedUpTo(catId, ym) + activityUpTo(catId, ym);

  const totalIncome = transactions.filter((t) => t.kind === "INCOME").reduce((s, t) => s + t.amountCents, 0);
  const totalAssigned = budgetEntries.reduce((s, b) => s + b.amountCents, 0);
  const readyToAssign = totalIncome - totalAssigned;

  const assignedThisMonth = categories.reduce((s, c) => s + assignedIn(c.id, month), 0);
  const netWorth = Object.values(acctBalance).reduce((a, b) => a + b, 0);

  return {
    acctBalance,
    assignedIn,
    assignedUpTo,
    activityIn,
    activityUpTo,
    available,
    readyToAssign,
    assignedThisMonth,
    netWorth,
    totalIncome,
  };
}

// One pass over all transactions building Map<month, Map<categoryId, netCents>>. Every
// category gets its ordinary "sum of transactions tagged with this categoryId" contribution;
// payment categories additionally get a derived contribution from their linked card's
// transactions (covered purchases add, payments to the card subtract).
//
// TODO(overspending): this assumes every credit purchase is fully covered by its spending
// category (per spec, first pass). Two related gaps are deliberately deferred here, not
// silently fixed: (1) uncategorized card charges (categoryId===null) never reach the
// `categoryId != null` check below, so they never move money into the payment category even
// though they do increase the card's real debt — same shape of problem as overspending, not a
// separate bug. (2) a transfer between two on-budget credit cards (a balance transfer) only
// updates the DESTINATION card's payment category here; the source card's payment category is
// never credited for the debt it shed. See budget.test.ts for pending regression tests on both.
function buildActivityByMonth(
  transactions: Transaction[],
  accountIdToPaymentCategoryId: Map<string, string>
): Map<string, Map<string, number>> {
  const byMonth = new Map<string, Map<string, number>>();
  const add = (ym: string, categoryId: string, cents: number) => {
    if (!byMonth.has(ym)) byMonth.set(ym, new Map());
    const entries = byMonth.get(ym)!;
    entries.set(categoryId, (entries.get(categoryId) || 0) + cents);
  };

  transactions.forEach((t) => {
    const ym = monthKeyOf(t.date);
    if (t.categoryId) add(ym, t.categoryId, t.amountCents);

    const paymentCategoryId = accountIdToPaymentCategoryId.get(t.accountId);
    if (!paymentCategoryId) return;
    if (t.kind === "NORMAL" && t.categoryId != null) {
      // A covered purchase (amountCents negative) or its refund/return (amountCents positive)
      // — signed negation nets correctly across both in the same month, unlike abs().
      add(ym, paymentCategoryId, -t.amountCents);
    } else if (t.kind === "TRANSFER" && t.amountCents > 0) {
      // The destination leg of a payment landing on this card.
      add(ym, paymentCategoryId, -t.amountCents);
    }
  });

  return byMonth;
}

export type PaymentBreakdownEntry = { sourceCategoryId: string; amount: number };
export type PaymentEntry = { transactionId: string; amount: number };
export type PaymentCategoryBreakdown = {
  categoryId: string;
  breakdown: PaymentBreakdownEntry[];
  payments: PaymentEntry[];
};

// Exposes WHY a payment category's available balance is what it is — the transparency
// requirement this feature exists for. Scoped to one month, matching activity(P, month)'s
// explicit month-scoping (not the cumulative `available`). Kept separate from computeDerived's
// hot path since it needs per-transaction detail (transactionId) that activityByMonth discards,
// and is only needed for the handful of payment categories, not every category on every render.
//
// Invariant: sum(breakdown[].amount) - sum(payments[].amount) === activityIn(categoryId, month)
export function computePaymentCategoryBreakdown(
  inputs: BudgetInputs,
  categoryId: string,
  month: string
): PaymentCategoryBreakdown | null {
  const category = inputs.categories.find((c) => c.id === categoryId);
  if (!category?.linkedAccountId) return null;

  const purchasesBySourceCategory = new Map<string, number>();
  const payments: PaymentEntry[] = [];

  inputs.transactions.forEach((t) => {
    if (t.accountId !== category.linkedAccountId || monthKeyOf(t.date) !== month) return;
    if (t.kind === "NORMAL" && t.categoryId != null) {
      purchasesBySourceCategory.set(t.categoryId, (purchasesBySourceCategory.get(t.categoryId) || 0) - t.amountCents);
    } else if (t.kind === "TRANSFER" && t.amountCents > 0) {
      payments.push({ transactionId: t.id, amount: t.amountCents });
    }
  });

  const breakdown: PaymentBreakdownEntry[] = Array.from(purchasesBySourceCategory.entries()).map(
    ([sourceCategoryId, amount]) => ({ sourceCategoryId, amount })
  );

  return { categoryId, breakdown, payments };
}

export const PAYMENT_GROUP_NAME = "Credit Card Payments";

// A fixed, well-known id for the singleton hidden group — matches the id the backfill
// migration (prisma/migrations/20260716180000_add_payment_categories) hardcodes. Using the
// same fixed id here lets addAccount `upsert` on it atomically instead of a
// findFirst-then-conditional-create, which was a real TOCTOU race under concurrent requests
// (no unique constraint backs `isHidden`, so two concurrent creates could each find nothing
// and both insert a group).
export const PAYMENT_GROUP_ID = "grp_cc_payments";

export type PaymentCategoryDraft = { name: string; linkedAccountId: string };

// The pure half of invariant 1 ("creating a credit account auto-creates exactly one linked
// payment category"): decides what that category should look like. The DB half (upsert the
// hidden group, insert the row, cascade-delete) lives in accounts/actions.ts — this stays here
// so the naming/idempotency decision is unit-testable without Prisma.
export function buildPaymentCategoryDraft(account: Pick<Account, "id" | "name">): PaymentCategoryDraft {
  return { name: `${account.name} Payment`, linkedAccountId: account.id };
}

export type GoalProgress = { pct: number; met: boolean };

// Ports the goal-progress calc from CatRow (original lines 478-487).
export function goalProgress(
  category: Pick<Category, "goalType" | "goalAmountCents">,
  assignedThisMonthForCat: number,
  availableForCat: number
): GoalProgress | null {
  if (!category.goalType || category.goalAmountCents == null) return null;
  if (category.goalType === "MONTHLY") {
    const pct = Math.min(100, Math.round((assignedThisMonthForCat / category.goalAmountCents) * 100));
    return { pct, met: assignedThisMonthForCat >= category.goalAmountCents };
  }
  const pct = Math.min(100, Math.round((availableForCat / category.goalAmountCents) * 100));
  return { pct, met: availableForCat >= category.goalAmountCents };
}

export type AutoAssignUpdate = { categoryId: string; amountCents: number };

// Ports autoAssignGoals (original lines 265-286): single pass over a snapshot of `derived`,
// draining readyToAssign across categories with goals in declaration order. Payment categories
// are skipped automatically (no goalType) unless a user manually sets one — no change needed
// here for them.
export function computeAutoAssignAllocations(inputs: BudgetInputs, month: string): AutoAssignUpdate[] {
  const derived = computeDerived(inputs, month);
  let rta = derived.readyToAssign;
  const updates: AutoAssignUpdate[] = [];
  inputs.categories.forEach((c) => {
    if (!c.goalType || rta <= 0) return;
    const curAssigned = derived.assignedIn(c.id, month);
    let need = 0;
    if (c.goalType === "MONTHLY") {
      need = (c.goalAmountCents || 0) - curAssigned;
    } else {
      const avail = derived.available(c.id, month);
      need = (c.goalAmountCents || 0) - avail;
    }
    if (need <= 0) return;
    const give = Math.min(need, rta);
    updates.push({ categoryId: c.id, amountCents: curAssigned + give });
    rta -= give;
  });
  return updates;
}
