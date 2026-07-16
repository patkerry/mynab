import { describe, expect, it } from "vitest";
import { computeDerived, computePaymentCategoryBreakdown, buildPaymentCategoryDraft } from "./budget";
import type { BudgetInputs } from "./budget";
import type { Account, BudgetEntry, Category, Transaction } from "@/generated/prisma/client";

const MONTH = "2026-07";

function account(overrides: Partial<Account> & Pick<Account, "id" | "name" | "type">): Account {
  return { onBudget: true, createdAt: new Date(), updatedAt: new Date(), ...overrides } as Account;
}

function category(overrides: Partial<Category> & Pick<Category, "id" | "groupId" | "name">): Category {
  return {
    goalType: null,
    goalAmountCents: null,
    linkedAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Category;
}

function txn(
  overrides: Partial<Transaction> & Pick<Transaction, "id" | "accountId" | "date" | "amountCents" | "kind">
): Transaction {
  return {
    payee: "Test",
    memo: "",
    categoryId: null,
    cleared: true,
    transferId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Transaction;
}

function budgetEntry(
  overrides: Partial<BudgetEntry> & Pick<BudgetEntry, "id" | "categoryId" | "yearMonth" | "amountCents">
): BudgetEntry {
  return { createdAt: new Date(), updatedAt: new Date(), ...overrides } as BudgetEntry;
}

// Base fixture: a checking account, an on-budget credit card with its linked payment category,
// and one ordinary spending category — mirrors the shape a real addAccount + backfill would
// produce (see accounts/actions.ts and the payment_categories migration).
function baseInputs(transactions: Transaction[] = [], budgetEntries: BudgetEntry[] = []): BudgetInputs {
  return {
    accounts: [account({ id: "a_check", name: "Checking", type: "CHECKING" }), account({ id: "a_card", name: "Visa", type: "CREDIT" })],
    categories: [
      category({ id: "c_groc", groupId: "g1", name: "Groceries" }),
      category({ id: "c_dine", groupId: "g1", name: "Dining Out" }),
      category({ id: "c_pay", groupId: "g_hidden", name: "Visa Payment", linkedAccountId: "a_card" }),
    ],
    transactions,
    budgetEntries,
  };
}

function totalAvailable(inputs: BudgetInputs, month: string): number {
  const derived = computeDerived(inputs, month);
  return inputs.categories.reduce((s, c) => s + derived.available(c.id, month), 0);
}

describe("credit card purchase (invariant 2)", () => {
  it("moves $X from the spending category to the payment category, leaves RTA and shifts net worth by -X", () => {
    const before = computeDerived(baseInputs(), MONTH);

    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const after = computeDerived(baseInputs([purchase]), MONTH);

    expect(after.available("c_groc", MONTH)).toBe(before.available("c_groc", MONTH) - 5000);
    expect(after.available("c_pay", MONTH)).toBe(before.available("c_pay", MONTH) + 5000);
    expect(after.readyToAssign).toBe(before.readyToAssign);
    expect(after.netWorth).toBe(before.netWorth - 5000);
  });
});

describe("credit card payment (invariant 3)", () => {
  it("reduces the payment category's available by $Y, moves balances, leaves RTA and net worth unchanged", () => {
    const income = txn({ id: "t0", accountId: "a_check", date: `${MONTH}-01`, kind: "INCOME", amountCents: 100000 });
    const before = computeDerived(baseInputs([income]), MONTH);

    const paymentOut = txn({
      id: "t1",
      accountId: "a_check",
      date: `${MONTH}-10`,
      kind: "TRANSFER",
      amountCents: -3000,
      transferId: "xfer1",
    });
    const paymentIn = txn({
      id: "t2",
      accountId: "a_card",
      date: `${MONTH}-10`,
      kind: "TRANSFER",
      amountCents: 3000,
      transferId: "xfer1",
    });
    const after = computeDerived(baseInputs([income, paymentOut, paymentIn]), MONTH);

    expect(after.available("c_pay", MONTH)).toBe(before.available("c_pay", MONTH) - 3000);
    expect(after.acctBalance["a_check"]).toBe(before.acctBalance["a_check"] - 3000);
    expect(after.acctBalance["a_card"]).toBe(before.acctBalance["a_card"] + 3000);
    expect(after.readyToAssign).toBe(before.readyToAssign);
    expect(after.netWorth).toBe(before.netWorth);
  });
});

describe("conservation of total available (invariant 4)", () => {
  it("is unchanged by a pure credit purchase", () => {
    const inputsBefore = baseInputs();
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const inputsAfter = baseInputs([purchase]);

    expect(totalAvailable(inputsAfter, MONTH)).toBe(totalAvailable(inputsBefore, MONTH));
  });

  it("is unchanged even when a same-month refund exists on the card (regression guard for the abs() bug)", () => {
    // A naive `abs(amountCents)` sum for creditPurchasesIn would count the purchase (5000) and
    // the refund (2000) as two positive contributions (7000) instead of netting them (3000) —
    // producing a $40 phantom gain in total available. Signed negation fixes this.
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const refund = txn({ id: "t2", accountId: "a_card", date: `${MONTH}-12`, kind: "NORMAL", categoryId: "c_groc", amountCents: 2000 });
    const inputsAfter = baseInputs([purchase, refund]);

    expect(totalAvailable(inputsAfter, MONTH)).toBe(totalAvailable(baseInputs(), MONTH));

    const derived = computeDerived(inputsAfter, MONTH);
    expect(derived.available("c_groc", MONTH)).toBe(-3000); // -5000 + 2000
    expect(derived.available("c_pay", MONTH)).toBe(3000); // the exact inverse, not 7000
  });
});

describe("month-to-month rollover", () => {
  const M1 = "2026-06";
  const M2 = "2026-07";
  const M3 = "2026-08";

  it("unspent assigned money carries forward into a month with no new activity or assignment", () => {
    const assignM1 = budgetEntry({ id: "b1", categoryId: "c_groc", yearMonth: M1, amountCents: 10000 });
    const spendM1 = txn({ id: "t1", accountId: "a_check", date: `${M1}-15`, kind: "NORMAL", categoryId: "c_groc", amountCents: -6000 });
    const derived = computeDerived(baseInputs([spendM1], [assignM1]), M2);

    expect(derived.available("c_groc", M1)).toBe(4000); // 10000 assigned - 6000 spent
    expect(derived.assignedIn("c_groc", M2)).toBe(0); // nothing newly assigned in M2 itself
    expect(derived.activityIn("c_groc", M2)).toBe(0); // no activity in M2 itself
    expect(derived.available("c_groc", M2)).toBe(4000); // but available rolls the $40 forward
  });

  it("overspending carries forward as a negative available, and a later assignment tops it up on top of the deficit", () => {
    const assignM1 = budgetEntry({ id: "b1", categoryId: "c_groc", yearMonth: M1, amountCents: 5000 });
    const spendM1 = txn({ id: "t1", accountId: "a_check", date: `${M1}-15`, kind: "NORMAL", categoryId: "c_groc", amountCents: -8000 });

    const derivedM1 = computeDerived(baseInputs([spendM1], [assignM1]), M1);
    expect(derivedM1.available("c_groc", M1)).toBe(-3000); // overspent by $30

    const derivedM2NoNewAssignment = computeDerived(baseInputs([spendM1], [assignM1]), M2);
    expect(derivedM2NoNewAssignment.available("c_groc", M2)).toBe(-3000); // deficit rolls forward, not reset to 0

    const assignM2 = budgetEntry({ id: "b2", categoryId: "c_groc", yearMonth: M2, amountCents: 5000 });
    const derivedM2 = computeDerived(baseInputs([spendM1], [assignM1, assignM2]), M2);
    expect(derivedM2.available("c_groc", M2)).toBe(2000); // -3000 deficit + 5000 new assignment
  });

  it("rolls forward across more than one empty month in between", () => {
    const assignM1 = budgetEntry({ id: "b1", categoryId: "c_groc", yearMonth: M1, amountCents: 10000 });
    const spendM1 = txn({ id: "t1", accountId: "a_check", date: `${M1}-15`, kind: "NORMAL", categoryId: "c_groc", amountCents: -4000 });
    const derived = computeDerived(baseInputs([spendM1], [assignM1]), M3);

    expect(derived.available("c_groc", M3)).toBe(6000); // still $60, two months later, untouched
  });

  it("a payment category's available rolls forward the same way, and a payment in a later month reduces the rolled-forward balance", () => {
    const purchaseM1 = txn({ id: "t1", accountId: "a_card", date: `${M1}-10`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const derivedM2NoPayment = computeDerived(baseInputs([purchaseM1]), M2);
    expect(derivedM2NoPayment.available("c_pay", M2)).toBe(5000); // still needs $50 to pay it off

    const paymentM2 = txn({ id: "t2", accountId: "a_card", date: `${M2}-10`, kind: "TRANSFER", amountCents: 3000, transferId: "xfer1" });
    const derivedM2 = computeDerived(baseInputs([purchaseM1, paymentM2]), M2);
    expect(derivedM2.available("c_pay", M2)).toBe(2000); // $50 rolled forward minus the $30 payment
  });
});

describe("retroactive history (documented, intentional — not a bug)", () => {
  it("a payment category backfilled onto a pre-existing card reflects that card's full transaction history, not just activity from after the category existed", () => {
    // The backfill migration creates a payment category for an ALREADY-USED card — this
    // transaction predates the category's own (conceptual) existence by six months.
    const priorMonth = "2026-01";
    const oldPurchase = txn({ id: "old1", accountId: "a_card", date: `${priorMonth}-10`, kind: "NORMAL", categoryId: "c_groc", amountCents: -10000 });
    const derived = computeDerived(baseInputs([oldPurchase]), MONTH);

    // No BudgetEntry could ever have existed for c_pay in priorMonth (the category didn't
    // exist "back then" either) — assignedUpTo is 0, but activityUpTo still picks up the old
    // purchase since activity is keyed by the linked card's transactions, not by the category's
    // own creation date. This mirrors acctBalance's own all-time-cumulative semantics.
    expect(derived.available("c_pay", MONTH)).toBe(10000);
  });
});

describe("payment category transparency breakdown", () => {
  it("reconciles with activityIn: sum(breakdown) - sum(payments) === activityIn(P, month)", () => {
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const refund = txn({ id: "t2", accountId: "a_card", date: `${MONTH}-12`, kind: "NORMAL", categoryId: "c_groc", amountCents: 2000 });
    const dining = txn({ id: "t3", accountId: "a_card", date: `${MONTH}-15`, kind: "NORMAL", categoryId: "c_dine", amountCents: -1500 });
    const paymentIn = txn({ id: "t4", accountId: "a_card", date: `${MONTH}-20`, kind: "TRANSFER", amountCents: 4000, transferId: "xfer1" });
    const inputs = baseInputs([purchase, refund, dining, paymentIn]);

    const derived = computeDerived(inputs, MONTH);
    const result = computePaymentCategoryBreakdown(inputs, "c_pay", MONTH)!;

    expect(result).not.toBeNull();
    const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
    const paymentsSum = result.payments.reduce((s, p) => s + p.amount, 0);
    expect(breakdownSum - paymentsSum).toBe(derived.activityIn("c_pay", MONTH));

    // Groceries nets 3000 (5000 - 2000), Dining contributes 1500, one payment of 4000.
    expect(result.breakdown.find((b) => b.sourceCategoryId === "c_groc")?.amount).toBe(3000);
    expect(result.breakdown.find((b) => b.sourceCategoryId === "c_dine")?.amount).toBe(1500);
    expect(result.payments).toEqual([{ transactionId: "t4", amount: 4000 }]);
  });

  it("returns null for a category that isn't a payment category", () => {
    expect(computePaymentCategoryBreakdown(baseInputs(), "c_groc", MONTH)).toBeNull();
  });
});

describe("invariant 1 (pure half): payment category shape", () => {
  it("builds a name derived from the account and links to it", () => {
    expect(buildPaymentCategoryDraft({ id: "a_card", name: "Visa Credit Card" })).toEqual({
      name: "Visa Credit Card Payment",
      linkedAccountId: "a_card",
    });
  });
});

describe("known, deferred limitations", () => {
  it.todo("overspending: a credit purchase larger than what its spending category has available should surface the uncovered shortfall instead of silently over-crediting the payment category");

  it("card-to-card balance transfer only credits the destination card's payment category (regression baseline, not desired final behavior)", () => {
    const cardA = account({ id: "a_cardA", name: "Card A", type: "CREDIT" });
    const cardB = account({ id: "a_cardB", name: "Card B", type: "CREDIT" });
    const payA = category({ id: "c_payA", groupId: "g_hidden", name: "Card A Payment", linkedAccountId: "a_cardA" });
    const payB = category({ id: "c_payB", groupId: "g_hidden", name: "Card B Payment", linkedAccountId: "a_cardB" });
    const inputs: BudgetInputs = {
      accounts: [cardA, cardB],
      categories: [payA, payB],
      transactions: [
        txn({ id: "t1", accountId: "a_cardA", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: -10000, transferId: "xfer1" }),
        txn({ id: "t2", accountId: "a_cardB", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: 10000, transferId: "xfer1" }),
      ],
      budgetEntries: [],
    };
    const derived = computeDerived(inputs, MONTH);

    // Destination (B) is credited as if it received a payment — its "amount needed" drops.
    expect(derived.activityIn("c_payB", MONTH)).toBe(-10000);
    // Source (A) took on the debt (its balance dropped by 10000, same as any purchase would)
    // but its payment category is NOT increased to reflect that — this is the known gap.
    expect(derived.activityIn("c_payA", MONTH)).toBe(0);
    expect(derived.acctBalance["a_cardA"]).toBe(-10000);
    expect(derived.acctBalance["a_cardB"]).toBe(10000);
  });
});
