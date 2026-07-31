import { describe, expect, it } from "vitest";
import {
  monthsForRange,
  expandSplits,
  summary,
  spendByCategory,
  incomeVsSpending,
  netWorthTrend,
  categorySpendTrend,
  topMerchants,
  budgetVsActual,
} from "./reports";
import type { Category, Transaction, BudgetEntry, TransactionSplit } from "@/generated/prisma-postgres/client";

const cat = (o: Partial<Category> & Pick<Category, "id" | "name">): Category =>
  ({ groupId: "g", goalType: null, goalAmountCents: null, linkedAccountId: null, budgetId: "b", sortOrder: 0, isHidden: false, createdAt: new Date(), updatedAt: new Date(), ...o } as Category);
const txn = (o: Partial<Transaction> & Pick<Transaction, "id" | "date" | "amountCents">): Transaction =>
  ({ budgetId: "b", accountId: "a", payee: "P", memo: "", kind: "NORMAL", categoryId: "c1", cleared: true, pending: false, externalId: null, transferId: null, counterpartAccountId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...o } as Transaction);
const be = (o: Partial<BudgetEntry> & Pick<BudgetEntry, "id" | "categoryId" | "yearMonth" | "amountCents">): BudgetEntry =>
  ({ budgetId: "b", createdAt: new Date(), updatedAt: new Date(), ...o } as BudgetEntry);

const CATS = [cat({ id: "c1", name: "Groceries" }), cat({ id: "c2", name: "Rent" }), cat({ id: "cp", name: "Visa Payment", linkedAccountId: "acc" })];

describe("monthsForRange", () => {
  it("builds trailing windows oldest-first", () => {
    expect(monthsForRange("1m", "2026-07")).toEqual(["2026-07"]);
    expect(monthsForRange("3m", "2026-07")).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(monthsForRange("6m", "2026-03")).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });
  it("YTD is Jan..current of the current year", () => {
    expect(monthsForRange("ytd", "2026-04")).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
});

describe("summary", () => {
  it("nets income minus spending and computes savings rate over the window", () => {
    const txns = [
      txn({ id: "t1", date: "2026-07-01", amountCents: 100000, kind: "INCOME", categoryId: null }),
      txn({ id: "t2", date: "2026-07-05", amountCents: -30000, categoryId: "c1" }),
      txn({ id: "t3", date: "2026-06-05", amountCents: -99999, categoryId: "c1" }), // outside window
    ];
    const s = summary(txns, ["2026-07"]);
    expect(s.incomeCents).toBe(100000);
    expect(s.spendingCents).toBe(30000);
    expect(s.netCents).toBe(70000);
    expect(s.savingsRate).toBeCloseTo(0.7, 5);
  });
  it("savings rate is 0 when there is no income", () => {
    expect(summary([txn({ id: "t", date: "2026-07-01", amountCents: -5000, categoryId: "c1" })], ["2026-07"]).savingsRate).toBe(0);
  });
  it("pending rows count as neither income nor spending — same contract as the budget engine", () => {
    // Imports land inflows as pending INCOME; until approved they must not inflate the income KPI
    // (the budget's RTA doesn't move until approval — the two screens must agree).
    const txns = [
      txn({ id: "t1", date: "2026-07-01", amountCents: 100000, kind: "INCOME", categoryId: null, pending: true }),
      txn({ id: "t2", date: "2026-07-05", amountCents: -30000, categoryId: "c1", pending: true }),
      txn({ id: "t3", date: "2026-07-06", amountCents: -2000, categoryId: "c1" }),
    ];
    const s = summary(txns, ["2026-07"]);
    expect(s.incomeCents).toBe(0);
    expect(s.spendingCents).toBe(2000);
  });
});

describe("spendByCategory", () => {
  it("sums outflows per category across the window, sorted desc, ignoring income/transfers", () => {
    const txns = [
      txn({ id: "t1", date: "2026-07-01", amountCents: -20000, categoryId: "c1" }),
      txn({ id: "t2", date: "2026-06-01", amountCents: -50000, categoryId: "c2" }),
      txn({ id: "t3", date: "2026-07-02", amountCents: 9999, kind: "INCOME", categoryId: null }),
      txn({ id: "t4", date: "2026-07-03", amountCents: -1000, kind: "TRANSFER", categoryId: null }),
    ];
    const r = spendByCategory(txns, CATS, ["2026-06", "2026-07"]);
    expect(r).toEqual([
      { id: "c2", name: "Rent", value: 500 },
      { id: "c1", name: "Groceries", value: 200 },
    ]);
  });
});

describe("incomeVsSpending", () => {
  it("produces a per-month income/spending row", () => {
    const txns = [
      txn({ id: "t1", date: "2026-07-01", amountCents: 100000, kind: "INCOME", categoryId: null }),
      txn({ id: "t2", date: "2026-07-05", amountCents: -40000, categoryId: "c1" }),
    ];
    const r = incomeVsSpending(txns, ["2026-06", "2026-07"]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ Income: 0, Spending: 0 });
    expect(r[1]).toMatchObject({ Income: 1000, Spending: 400 });
  });
});

describe("categorySpendTrend", () => {
  it("keeps the top 6 categories and folds the rest into Other", () => {
    const many = Array.from({ length: 8 }, (_, i) => cat({ id: `k${i}`, name: `C${i}` }));
    // each category spends (8-i)*100 in 2026-07 so k0 is biggest, k7 smallest
    const txns = many.map((c, i) => txn({ id: `t${i}`, date: "2026-07-10", amountCents: -(8 - i) * 10000, categoryId: c.id }));
    const { series, data } = categorySpendTrend(txns, many, ["2026-07"]);
    expect(series.map((s) => s.key)).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "__other"]);
    // Other = k6 ($200) + k7 ($100) = $300
    expect((data[0] as Record<string, number>)["__other"]).toBe(300);
  });
  it("adds no Other series when there are 6 or fewer categories", () => {
    const txns = [txn({ id: "t1", date: "2026-07-01", amountCents: -10000, categoryId: "c1" })];
    const { series } = categorySpendTrend(txns, CATS, ["2026-07"]);
    expect(series.some((s) => s.key === "__other")).toBe(false);
  });
});

describe("topMerchants", () => {
  it("ranks payees by spend within the window", () => {
    const txns = [
      txn({ id: "t1", date: "2026-07-01", amountCents: -3000, payee: "Costco", categoryId: "c1" }),
      txn({ id: "t2", date: "2026-07-02", amountCents: -5000, payee: "Costco", categoryId: "c1" }),
      txn({ id: "t3", date: "2026-07-03", amountCents: -1000, payee: "Cafe", categoryId: "c1" }),
    ];
    expect(topMerchants(txns, ["2026-07"])).toEqual([
      { name: "Costco", value: 80 },
      { name: "Cafe", value: 10 },
    ]);
  });
});

describe("budgetVsActual", () => {
  it("pairs assigned vs spent per category and excludes payment categories", () => {
    const txns = [txn({ id: "t1", date: "2026-07-05", amountCents: -30000, categoryId: "c1" })];
    const entries = [be({ id: "b1", categoryId: "c1", yearMonth: "2026-07", amountCents: 40000 }), be({ id: "b2", categoryId: "cp", yearMonth: "2026-07", amountCents: 10000 })];
    const r = budgetVsActual(txns, CATS, entries, ["2026-07"]);
    expect(r).toEqual([{ id: "c1", name: "Groceries", Assigned: 400, Spent: 300 }]);
  });
});

describe("expandSplits", () => {
  const line = (o: Partial<TransactionSplit> & Pick<TransactionSplit, "id" | "transactionId" | "amountCents"> & { categoryId: string | null }): TransactionSplit =>
    ({ budgetId: "b", memo: "", createdAt: new Date(), updatedAt: new Date(), ...o } as TransactionSplit);

  // A split deposit (+$300: $250 paycheck RTA line + $50 Groceries refund) and a split spend
  // (-$80 Costco: $50 Groceries + $30 Rent), plus one plain row that must pass through untouched.
  const txns = [
    txn({ id: "t1", date: "2026-07-02", amountCents: 30000, categoryId: null, payee: "Deposit" }),
    txn({ id: "t2", date: "2026-07-05", amountCents: -8000, categoryId: null, payee: "Costco" }),
    txn({ id: "t3", date: "2026-07-06", amountCents: -1000, categoryId: "c1", payee: "Corner Store" }),
  ];
  const splits = [
    line({ id: "s1", transactionId: "t1", categoryId: null, amountCents: 25000 }),
    line({ id: "s2", transactionId: "t1", categoryId: "c1", amountCents: 5000 }),
    line({ id: "s3", transactionId: "t2", categoryId: "c1", amountCents: -5000 }),
    line({ id: "s4", transactionId: "t2", categoryId: "c2", amountCents: -3000 }),
  ];
  const expanded = expandSplits(txns, splits);

  it("fans split parents into per-line pseudo-rows and leaves plain rows untouched", () => {
    expect(expanded).toHaveLength(5); // 2 + 2 + 1
    expect(expanded.filter((t) => t.kind === "INCOME")).toHaveLength(1); // the RTA line
    expect(expanded.find((t) => t.id === "t3")).toBe(txns[2]);
  });

  it("spendByCategory sees each line's category", () => {
    const by = spendByCategory(expanded, CATS, ["2026-07"]);
    expect(by).toEqual(
      expect.arrayContaining([
        { id: "c1", name: "Groceries", value: 60 }, // 50 split + 10 plain
        { id: "c2", name: "Rent", value: 30 },
      ])
    );
  });

  it("summary counts the RTA line as income and the refund line as categorized inflow", () => {
    const s = summary(expanded, ["2026-07"]);
    expect(s.incomeCents).toBe(30000); // 25000 INCOME pseudo-row + 5000 categorized inflow
    expect(s.spendingCents).toBe(9000);
  });

  it("topMerchants attributes a whole split to one payee", () => {
    const m = topMerchants(expanded, ["2026-07"]);
    expect(m.find((r) => r.name === "Costco")?.value).toBe(80);
  });

  it("netWorthTrend over the ORIGINAL rows equals the trend over expanded rows (totals preserved)", () => {
    expect(netWorthTrend(txns, ["2026-07"])).toEqual(netWorthTrend(expanded, ["2026-07"]));
  });

  it("pending split parents produce pending pseudo-rows (still excluded everywhere)", () => {
    const pendingParent = [txn({ id: "t9", date: "2026-07-09", amountCents: -4000, categoryId: null, pending: true })];
    const pendingLines = [
      line({ id: "s9", transactionId: "t9", categoryId: "c1", amountCents: -4000 }),
      line({ id: "s10", transactionId: "t9", categoryId: "c2", amountCents: 0 }),
    ];
    const out = expandSplits(pendingParent, pendingLines);
    expect(out.every((t) => t.pending)).toBe(true);
  });

  it("no splits = same array back", () => {
    expect(expandSplits(txns, [])).toBe(txns);
  });
});
