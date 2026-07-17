import { describe, expect, it } from "vitest";
import { computeDerived, computePaymentCategoryBreakdown, buildPaymentCategoryDraft, computeOverspendCoverage } from "./budget";
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
    pending: false,
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
    expect(result.breakdown.find((b) => "sourceCategoryId" in b && b.sourceCategoryId === "c_groc")?.amount).toBe(3000);
    expect(result.breakdown.find((b) => "sourceCategoryId" in b && b.sourceCategoryId === "c_dine")?.amount).toBe(1500);
    expect(result.payments).toEqual([{ transactionId: "t4", amount: 4000 }]);
  });

  it("returns null for a category that isn't a payment category", () => {
    expect(computePaymentCategoryBreakdown(baseInputs(), "c_groc", MONTH)).toBeNull();
  });

  it("attributes a card-to-card balance transfer to the counterpart account, not a spending category", () => {
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

    const result = computePaymentCategoryBreakdown(inputs, "c_payA", MONTH)!;
    expect(result.breakdown).toEqual([{ sourceAccountId: "a_cardB", amount: 10000 }]);
    expect(result.payments).toEqual([]);
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

describe("card-to-card balance transfers", () => {
  function twoCardFixture(transferAmountCents: number) {
    const cardA = account({ id: "a_cardA", name: "Card A", type: "CREDIT" });
    const cardB = account({ id: "a_cardB", name: "Card B", type: "CREDIT" });
    const payA = category({ id: "c_payA", groupId: "g_hidden", name: "Card A Payment", linkedAccountId: "a_cardA" });
    const payB = category({ id: "c_payB", groupId: "g_hidden", name: "Card B Payment", linkedAccountId: "a_cardB" });
    const inputs: BudgetInputs = {
      accounts: [cardA, cardB],
      categories: [payA, payB],
      transactions: [
        txn({ id: "t1", accountId: "a_cardA", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: -transferAmountCents, transferId: "xfer1" }),
        txn({ id: "t2", accountId: "a_cardB", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: transferAmountCents, transferId: "xfer1" }),
      ],
      budgetEntries: [],
    };
    return inputs;
  }

  it("credits the destination card's payment category and DEBITS the source card's payment category by the same amount (previously a known gap — now fixed)", () => {
    const inputs = twoCardFixture(10000);
    const derived = computeDerived(inputs, MONTH);

    // Destination (B) is credited as if it received a payment — its "amount needed" drops.
    expect(derived.activityIn("c_payB", MONTH)).toBe(-10000);
    // Source (A) took on the debt (its balance dropped by 10000, same as any purchase would) —
    // its payment category now increases to reflect that, the same way a real purchase would.
    expect(derived.activityIn("c_payA", MONTH)).toBe(10000);
    expect(derived.acctBalance["a_cardA"]).toBe(-10000);
    expect(derived.acctBalance["a_cardB"]).toBe(10000);
  });

  it("conserves total available across both payment categories, same as an ordinary purchase does", () => {
    const before = computeDerived(twoCardFixture(0), MONTH); // no transfer yet, both start at 0
    const totalBefore = ["c_payA", "c_payB"].reduce((s, id) => s + before.available(id, MONTH), 0);

    const after = computeDerived(twoCardFixture(10000), MONTH);
    const totalAfter = ["c_payA", "c_payB"].reduce((s, id) => s + after.available(id, MONTH), 0);

    expect(totalAfter).toBe(totalBefore); // moved from A to B, not created or destroyed
  });

  it("a transfer to a NON-card account (e.g. a cash advance into checking) is left unaffected — only card-to-card debits the source", () => {
    const cardA = account({ id: "a_cardA", name: "Card A", type: "CREDIT" });
    const checking = account({ id: "a_check2", name: "Checking", type: "CHECKING" });
    const payA = category({ id: "c_payA", groupId: "g_hidden", name: "Card A Payment", linkedAccountId: "a_cardA" });
    const inputs: BudgetInputs = {
      accounts: [cardA, checking],
      categories: [payA],
      transactions: [
        txn({ id: "t1", accountId: "a_cardA", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: -5000, transferId: "xfer1" }),
        txn({ id: "t2", accountId: "a_check2", date: `${MONTH}-05`, kind: "TRANSFER", amountCents: 5000, transferId: "xfer1" }),
      ],
      budgetEntries: [],
    };
    const derived = computeDerived(inputs, MONTH);
    // Not a card-to-card transfer (checking isn't a linked card) — behavior is unchanged from
    // before this fix: the card's own payment category doesn't move.
    expect(derived.activityIn("c_payA", MONTH)).toBe(0);
  });
});

describe("overspend coverage (credit-card overspending auto-covered from Ready-to-Assign)", () => {
  it("needs no coverage when the category isn't overspent", () => {
    const income = txn({ id: "t0", accountId: "a_check", date: `${MONTH}-01`, kind: "INCOME", amountCents: 100000 });
    const assign = budgetEntry({ id: "b1", categoryId: "c_groc", yearMonth: MONTH, amountCents: 5000 });
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -3000 });
    const inputs = baseInputs([income, purchase], [assign]);

    expect(computeDerived(inputs, MONTH).available("c_groc", MONTH)).toBe(2000); // not overspent
    expect(computeOverspendCoverage(inputs, "c_groc", MONTH)).toBe(0);
  });

  it("fully covers the shortfall from Ready-to-Assign when there's enough", () => {
    const income = txn({ id: "t0", accountId: "a_check", date: `${MONTH}-01`, kind: "INCOME", amountCents: 100000 });
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -8000 });
    const inputs = baseInputs([income, purchase]); // nothing assigned -> fully overspent by 8000

    const before = computeDerived(inputs, MONTH);
    expect(before.available("c_groc", MONTH)).toBe(-8000);
    expect(before.readyToAssign).toBe(100000);

    const coverage = computeOverspendCoverage(inputs, "c_groc", MONTH);
    expect(coverage).toBe(8000); // fully covered, RTA has plenty

    // Applying it (as the Server Action would, via a BudgetEntry upsert) zeroes out the
    // category and reduces RTA by exactly the coverage amount — conserving the total, the same
    // way any assignment (auto or manual) always does.
    const covered = budgetEntry({ id: "b_cover", categoryId: "c_groc", yearMonth: MONTH, amountCents: coverage });
    const after = computeDerived(baseInputs([income, purchase], [covered]), MONTH);
    expect(after.available("c_groc", MONTH)).toBe(0);
    expect(after.readyToAssign).toBe(before.readyToAssign - coverage);
  });

  it("only partially covers the shortfall when Ready-to-Assign doesn't have enough, leaving the remainder negative", () => {
    const income = txn({ id: "t0", accountId: "a_check", date: `${MONTH}-01`, kind: "INCOME", amountCents: 3000 }); // only $30 in RTA
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -8000 }); // $80 overspend
    const inputs = baseInputs([income, purchase]);

    expect(computeDerived(inputs, MONTH).available("c_groc", MONTH)).toBe(-8000);
    const coverage = computeOverspendCoverage(inputs, "c_groc", MONTH);
    expect(coverage).toBe(3000); // capped at what RTA actually has

    const covered = budgetEntry({ id: "b_cover", categoryId: "c_groc", yearMonth: MONTH, amountCents: coverage });
    const after = computeDerived(baseInputs([income, purchase], [covered]), MONTH);
    expect(after.available("c_groc", MONTH)).toBe(-5000); // $80 shortfall - $30 covered = $50 still short
    expect(after.readyToAssign).toBe(0);
  });

  it("needs no coverage when Ready-to-Assign is zero or negative", () => {
    const purchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -8000 });
    const inputs = baseInputs([purchase]); // no income at all -> RTA is 0

    expect(computeDerived(inputs, MONTH).readyToAssign).toBe(0);
    expect(computeOverspendCoverage(inputs, "c_groc", MONTH)).toBe(0);
  });
});

describe("pending (file-imported, not-yet-approved) transactions", () => {
  it("count toward acctBalance/netWorth but not toward category activity/available", () => {
    const before = computeDerived(baseInputs(), MONTH);
    const pendingPurchase = txn({
      id: "t1",
      accountId: "a_check",
      date: `${MONTH}-05`,
      kind: "NORMAL",
      categoryId: "c_groc",
      amountCents: -5000,
      pending: true,
    });
    const after = computeDerived(baseInputs([pendingPurchase]), MONTH);

    expect(after.acctBalance["a_check"]).toBe(before.acctBalance["a_check"] - 5000);
    expect(after.netWorth).toBe(before.netWorth - 5000);
    expect(after.available("c_groc", MONTH)).toBe(before.available("c_groc", MONTH)); // untouched until approved
    expect(after.activityIn("c_groc", MONTH)).toBe(0);
  });

  it("a pending purchase on a credit card doesn't move anything into its payment category either", () => {
    const pendingPurchase = txn({
      id: "t1",
      accountId: "a_card",
      date: `${MONTH}-05`,
      kind: "NORMAL",
      categoryId: "c_groc",
      amountCents: -5000,
      pending: true,
    });
    const derived = computeDerived(baseInputs([pendingPurchase]), MONTH);

    expect(derived.available("c_pay", MONTH)).toBe(0);
    expect(derived.acctBalance["a_card"]).toBe(-5000); // balance still reflects it
  });

  it("excludes a pending INCOME transaction from totalIncome/readyToAssign", () => {
    const before = computeDerived(baseInputs(), MONTH);
    const pendingIncome = txn({ id: "t1", accountId: "a_check", date: `${MONTH}-05`, kind: "INCOME", amountCents: 100000, pending: true });
    const after = computeDerived(baseInputs([pendingIncome]), MONTH);

    expect(after.totalIncome).toBe(before.totalIncome);
    expect(after.readyToAssign).toBe(before.readyToAssign);
    expect(after.acctBalance["a_check"]).toBe(before.acctBalance["a_check"] + 100000); // still lands in balance
  });

  it("is excluded from computePaymentCategoryBreakdown, and the reconciliation identity still holds", () => {
    const approvedPurchase = txn({ id: "t1", accountId: "a_card", date: `${MONTH}-05`, kind: "NORMAL", categoryId: "c_groc", amountCents: -5000 });
    const pendingPurchase = txn({
      id: "t2",
      accountId: "a_card",
      date: `${MONTH}-10`,
      kind: "NORMAL",
      categoryId: "c_dine",
      amountCents: -1500,
      pending: true,
    });
    const inputs = baseInputs([approvedPurchase, pendingPurchase]);

    const derived = computeDerived(inputs, MONTH);
    const result = computePaymentCategoryBreakdown(inputs, "c_pay", MONTH)!;

    expect(result.breakdown).toEqual([{ sourceCategoryId: "c_groc", amount: 5000 }]); // pending one excluded
    const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
    const paymentsSum = result.payments.reduce((s, p) => s + p.amount, 0);
    expect(breakdownSum - paymentsSum).toBe(derived.activityIn("c_pay", MONTH));
  });
});
