import { describe, expect, it } from "vitest";
import { validateSplitDraft, buildSplitsByTransaction, splitsSumToParent, type SplitLineDraft } from "./splits";

const CATS = new Set(["c_groc", "c_fun"]);
const PAY = new Set(["c_pay"]);
const base = {
  direction: "outflow" as const,
  parentAmount: "80.00",
  accountType: "CHECKING" as const,
  paymentCategoryIds: PAY as ReadonlySet<string>,
  validCategoryIds: CATS as ReadonlySet<string>,
};
const lines = (...ls: SplitLineDraft[]) => ls;

describe("validateSplitDraft", () => {
  it("accepts a valid outflow split and signs lines negative", () => {
    const v = validateSplitDraft({ ...base, lines: lines({ categoryId: "c_groc", amount: "50" }, { categoryId: "c_fun", amount: "30" }) });
    expect(v).toEqual({
      ok: true,
      totalCents: -8000,
      lines: [
        { categoryId: "c_groc", amountCents: -5000, memo: "" },
        { categoryId: "c_fun", amountCents: -3000, memo: "" },
      ],
    });
  });

  it("accepts an inflow split with an RTA line and signs positive", () => {
    const v = validateSplitDraft({
      ...base,
      direction: "inflow",
      parentAmount: "2100.00",
      lines: lines({ categoryId: "income", amount: "2000" }, { categoryId: "c_groc", amount: "100", memo: " refund " }),
    });
    expect(v).toEqual({
      ok: true,
      totalCents: 210000,
      lines: [
        { categoryId: null, amountCents: 200000, memo: "" },
        { categoryId: "c_groc", amountCents: 10000, memo: "refund" },
      ],
    });
  });

  it("rejects fewer than two lines", () => {
    const v = validateSplitDraft({ ...base, lines: lines({ categoryId: "c_groc", amount: "80" }) });
    expect(v.ok).toBe(false);
  });

  it("rejects a zero, negative, or garbage line amount — direction supplies the sign", () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      const v = validateSplitDraft({ ...base, lines: lines({ categoryId: "c_groc", amount }, { categoryId: "c_fun", amount: "80" }) });
      expect(v.ok).toBe(false);
    }
  });

  it("rejects a payment-category line (derived, never a split target)", () => {
    const v = validateSplitDraft({ ...base, lines: lines({ categoryId: "c_pay", amount: "50" }, { categoryId: "c_fun", amount: "30" }) });
    expect(v.ok).toBe(false);
  });

  it("rejects an unknown or empty line category", () => {
    for (const categoryId of ["c_other_budget", ""]) {
      const v = validateSplitDraft({ ...base, lines: lines({ categoryId, amount: "50" }, { categoryId: "c_fun", amount: "30" }) });
      expect(v.ok).toBe(false);
    }
  });

  it("rejects an RTA line on a CREDIT account (the income-on-card double-count lesson)", () => {
    const v = validateSplitDraft({
      ...base,
      accountType: "CREDIT",
      lines: lines({ categoryId: "income", amount: "50" }, { categoryId: "c_fun", amount: "30" }),
    });
    expect(v.ok).toBe(false);
    // The same lines on a checking account are fine.
    const onChecking = validateSplitDraft({ ...base, lines: lines({ categoryId: "income", amount: "50" }, { categoryId: "c_fun", amount: "30" }) });
    expect(onChecking.ok).toBe(true);
  });

  it("rejects lines that don't sum exactly to the parent amount", () => {
    const v = validateSplitDraft({ ...base, lines: lines({ categoryId: "c_groc", amount: "50" }, { categoryId: "c_fun", amount: "29.99" }) });
    expect(v.ok).toBe(false);
  });

  it("rejects a missing/zero parent amount", () => {
    const v = validateSplitDraft({ ...base, parentAmount: "", lines: lines({ categoryId: "c_groc", amount: "50" }, { categoryId: "c_fun", amount: "30" }) });
    expect(v.ok).toBe(false);
  });
});

describe("buildSplitsByTransaction", () => {
  it("groups lines by parent id, preserving order", () => {
    const byTxn = buildSplitsByTransaction([
      { transactionId: "t1", n: 1 },
      { transactionId: "t2", n: 2 },
      { transactionId: "t1", n: 3 },
    ]);
    expect(byTxn.get("t1")).toEqual([
      { transactionId: "t1", n: 1 },
      { transactionId: "t1", n: 3 },
    ]);
    expect(byTxn.get("t2")).toEqual([{ transactionId: "t2", n: 2 }]);
    expect(byTxn.get("t3")).toBeUndefined();
  });
});

describe("splitsSumToParent", () => {
  it("true iff lines sum exactly to the signed parent amount", () => {
    expect(splitsSumToParent(-8000, [{ amountCents: -5000 }, { amountCents: -3000 }])).toBe(true);
    expect(splitsSumToParent(-8000, [{ amountCents: -5000 }, { amountCents: -2999 }])).toBe(false);
    expect(splitsSumToParent(210000, [{ amountCents: 200000 }, { amountCents: 10000 }])).toBe(true);
    // Sign matters: same magnitude, wrong direction, is incoherent.
    expect(splitsSumToParent(8000, [{ amountCents: -5000 }, { amountCents: -3000 }])).toBe(false);
    expect(splitsSumToParent(-8000, [])).toBe(false);
  });
});
