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

  const assignedIn = (catId: string, ym: string) => budgetedByMonth.get(ym)?.get(catId) || 0;
  const assignedUpTo = (catId: string, ym: string) => {
    let s = 0;
    budgetedByMonth.forEach((entries, k) => {
      if (k <= ym) s += entries.get(catId) || 0;
    });
    return s;
  };
  const activityIn = (catId: string, ym: string) =>
    transactions
      .filter((t) => t.categoryId === catId && monthKeyOf(t.date) === ym)
      .reduce((s, t) => s + t.amountCents, 0);
  const activityUpTo = (catId: string, ym: string) =>
    transactions
      .filter((t) => t.categoryId === catId && monthKeyOf(t.date) <= ym)
      .reduce((s, t) => s + t.amountCents, 0);
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
// draining readyToAssign across categories with goals in declaration order.
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
