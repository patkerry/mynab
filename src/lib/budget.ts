import { monthKeyOf } from "./format";
import type { Account, BudgetEntry, Category, Transaction } from "@/generated/prisma-postgres/client";

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
  //
  // Retroactive history, intentional: because activity is derived from the linked card's
  // transactions rather than transactions tagged with the category's own id, a payment category
  // backfilled onto a pre-existing card (see the payment_categories migration) immediately
  // reflects that card's ENTIRE transaction history in available()'s all-time cumulative sum —
  // not just activity from after the category/migration existed. This mirrors acctBalance
  // (also an unbounded all-time sum) and produces the semantically correct "how much of this
  // card's current debt isn't budgeted for yet" figure. Locked in by a test in budget.test.ts
  // ("retroactive history") so this doesn't get mistaken for a bug and silently "fixed" later.
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

  const totalIncome = transactions
    .filter((t) => t.kind === "INCOME" && !t.pending)
    .reduce((s, t) => s + t.amountCents, 0);
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

// Looks up the OTHER leg of a transfer by transferId — needed to tell a card-to-card balance
// transfer apart from an ordinary payment (checking -> card) or cash advance (card -> checking):
// only the counterpart's account tells you that. Shared by buildActivityByMonth and
// computePaymentCategoryBreakdown so both see the same pairing.
function buildTransferPairLookup(transactions: Transaction[]): Map<string, Transaction> {
  const legsByTransferId = new Map<string, Transaction[]>();
  transactions.forEach((t) => {
    if (!t.transferId) return;
    if (!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
    legsByTransferId.get(t.transferId)!.push(t);
  });
  const pair = new Map<string, Transaction>();
  legsByTransferId.forEach((legs) => {
    if (legs.length === 2) {
      pair.set(legs[0].id, legs[1]);
      pair.set(legs[1].id, legs[0]);
    }
  });
  return pair;
}

// Classifies a transaction on a credit card's linked account as: a covered purchase (or its
// refund/return — same branch, signed negation nets them correctly, unlike abs()); a payment
// landing on the card; or, for a balance transfer between two linked cards, the debt the SOURCE
// card absorbed (the mirror image of the destination card's "payment"). Shared by
// buildActivityByMonth (the aggregate path) and computePaymentCategoryBreakdown (the
// per-transaction transparency path) so the two can't silently drift apart.
//
// This function still moves the FULL purchase amount into the payment category regardless of
// whether the spending category actually had that much available — that's intentional, not a
// gap: computeOverspendCoverage (below) separately auto-assigns any shortfall from
// Ready-to-Assign so the spending category doesn't just sit negative, mirroring real YNAB.
// Uncategorized card charges (categoryId===null) still never reach the `categoryId != null`
// check below and so still don't move money into the payment category, but a transaction can no
// longer be marked cleared while uncategorized (see toggleCleared in accounts/actions.ts), and
// reconciliation refuses unless everything's cleared — considerably narrowing when this can
// matter in practice.
type CardTransactionClassification =
  | { type: "purchase"; sourceCategoryId: string; contribution: number } // signed: purchase +, refund -
  | { type: "payment"; transactionId: string; amount: number } // raw positive payment amount
  | { type: "cardToCardDebit"; counterpartAccountId: string; amount: number } // raw positive amount absorbed
  | { type: "none" };

function classifyCardTransaction(
  t: Transaction,
  transferPair: Map<string, Transaction>,
  accountIdToPaymentCategoryId: Map<string, string>
): CardTransactionClassification {
  if (t.kind === "NORMAL" && t.categoryId != null) {
    return { type: "purchase", sourceCategoryId: t.categoryId, contribution: -t.amountCents };
  }
  if (t.kind === "TRANSFER" && t.amountCents > 0) {
    return { type: "payment", transactionId: t.id, amount: t.amountCents };
  }
  if (t.kind === "TRANSFER" && t.amountCents < 0) {
    const otherLeg = transferPair.get(t.id);
    // Only a balance transfer landing on ANOTHER linked card counts as debt absorbed — a
    // transfer to a non-card account (e.g. a cash advance into checking) is deliberately left
    // as "none" here, unchanged from before: unlike two cards' payment categories, whether that
    // money needs a "job" once it lands in checking isn't something this feature was asked to
    // model, and guessing would be worse than leaving it alone.
    if (otherLeg && accountIdToPaymentCategoryId.has(otherLeg.accountId)) {
      return { type: "cardToCardDebit", counterpartAccountId: otherLeg.accountId, amount: -t.amountCents };
    }
  }
  return { type: "none" };
}

// One pass over all transactions building Map<month, Map<categoryId, netCents>>. Every
// category gets its ordinary "sum of transactions tagged with this categoryId" contribution;
// payment categories additionally get a derived contribution from their linked card's
// transactions via classifyCardTransaction above.
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

  const transferPair = buildTransferPairLookup(transactions);

  transactions.forEach((t) => {
    // Pending (not-yet-approved, file-imported) transactions count toward acctBalance/netWorth
    // (unfiltered above) but stay invisible to every category/activity computation until a
    // human reviews and approves them — see the `pending` field's doc comment in schema.prisma.
    if (t.pending) return;
    const ym = monthKeyOf(t.date);
    if (t.categoryId) add(ym, t.categoryId, t.amountCents);

    const paymentCategoryId = accountIdToPaymentCategoryId.get(t.accountId);
    if (!paymentCategoryId) return;
    const classification = classifyCardTransaction(t, transferPair, accountIdToPaymentCategoryId);
    if (classification.type === "purchase") add(ym, paymentCategoryId, classification.contribution);
    else if (classification.type === "payment") add(ym, paymentCategoryId, -classification.amount);
    else if (classification.type === "cardToCardDebit") add(ym, paymentCategoryId, classification.amount);
  });

  return byMonth;
}

// A breakdown entry is either a real spending category (an ordinary covered purchase) or
// another linked account (debt absorbed via a card-to-card balance transfer) — never both,
// discriminated by which field is present.
export type PaymentBreakdownEntry = { sourceCategoryId: string; amount: number } | { sourceAccountId: string; amount: number };
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
  const debtsByCounterpartAccount = new Map<string, number>();
  const payments: PaymentEntry[] = [];
  const transferPair = buildTransferPairLookup(inputs.transactions);
  const accountIdToPaymentCategoryId = new Map<string, string>();
  inputs.categories.forEach((c) => {
    if (c.linkedAccountId) accountIdToPaymentCategoryId.set(c.linkedAccountId, c.id);
  });

  inputs.transactions.forEach((t) => {
    if (t.pending || t.accountId !== category.linkedAccountId || monthKeyOf(t.date) !== month) return;
    const classification = classifyCardTransaction(t, transferPair, accountIdToPaymentCategoryId);
    if (classification.type === "purchase") {
      purchasesBySourceCategory.set(
        classification.sourceCategoryId,
        (purchasesBySourceCategory.get(classification.sourceCategoryId) || 0) + classification.contribution
      );
    } else if (classification.type === "payment") {
      payments.push({ transactionId: classification.transactionId, amount: classification.amount });
    } else if (classification.type === "cardToCardDebit") {
      debtsByCounterpartAccount.set(
        classification.counterpartAccountId,
        (debtsByCounterpartAccount.get(classification.counterpartAccountId) || 0) + classification.amount
      );
    }
  });

  const breakdown: PaymentBreakdownEntry[] = [
    ...Array.from(purchasesBySourceCategory.entries()).map(([sourceCategoryId, amount]) => ({ sourceCategoryId, amount })),
    ...Array.from(debtsByCounterpartAccount.entries()).map(([sourceAccountId, amount]) => ({ sourceAccountId, amount })),
  ];

  return { categoryId, breakdown, payments };
}

// Display-ready shape for CatRow: sourceCategoryId resolved to a name, payments collapsed to a
// count + total (CatRow doesn't need individual transactionIds, just the summary line).
export type CatBreakdown = {
  sources: { name: string; amount: number }[];
  paymentsTotal: number;
  paymentsCount: number;
};

// Ports real YNAB's credit-overspending rule: if a credit card purchase pushes its spending
// category's available below zero, the shortfall is auto-covered from Ready-to-Assign (up to
// however much RTA actually has) instead of just sitting negative until the user notices and
// fixes it manually. This is the last of the three deferred credit-card gaps — scoped strictly
// to credit-card-caused overspends, per spec; cash overspending is unaffected and still just
// goes negative, matching how it always has.
//
// This is a PURE calculation of how much coverage is warranted given the current state
// (including whatever purchase already pushed the category negative) — it does not itself
// write anything. The caller (addTransaction/updateTransaction in accounts/actions.ts) applies
// it by upserting a BudgetEntry for (categoryId, month), the exact same mechanism a manual
// assignment already uses — auto-coverage is really just an auto-triggered "assign this much,"
// not a new kind of money movement. That's also why it doesn't break the "total available is
// conserved" invariant tested elsewhere: like any assignment, it moves money FROM
// Ready-to-Assign INTO a category's available, it doesn't create or destroy any.
//
// Deliberately does not attempt to claw back coverage if the transaction that triggered it is
// later edited or deleted — once assigned, it behaves exactly like a manual assignment would in
// the same situation (money sitting there is simply "available" again), which keeps this a
// one-directional, side-effect-free-to-reason-about operation rather than requiring a
// reconciliation pass over history.
export function computeOverspendCoverage(inputs: BudgetInputs, categoryId: string, month: string): number {
  const derived = computeDerived(inputs, month);
  const avail = derived.available(categoryId, month);
  if (avail >= 0) return 0;
  const shortfall = -avail;
  return Math.max(0, Math.min(shortfall, derived.readyToAssign));
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

// A transfer leg's displayed payee is derived live from its counterpartAccountId (see the field
// comment on Transaction in schema.postgres.prisma) rather than a name baked in at creation
// time — same principle BudgetView's resolveBreakdown already applies to card payments. Falls
// back to "?" rather than throwing if the counterpart account can't be found (e.g. stale data).
export function transferLabel(t: Pick<Transaction, "amountCents" | "counterpartAccountId">, accounts: Pick<Account, "id" | "name">[]): string {
  const name = accounts.find((a) => a.id === t.counterpartAccountId)?.name ?? "?";
  return t.amountCents < 0 ? `Transfer to ${name}` : `Transfer from ${name}`;
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
