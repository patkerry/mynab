import { describe, expect, it } from "vitest";
import { interpretDraft, transferSentinel } from "./draft";
import type { TxnDraft } from "./types";

const draft = (overrides: Partial<TxnDraft>): TxnDraft => ({
  date: "2026-07-24",
  payee: "Test",
  categoryId: "",
  accountId: "a_check",
  amount: "50.00",
  memo: "",
  ...overrides,
});

describe("interpretDraft", () => {
  it("rejects a missing/zero/garbage amount and a missing account", () => {
    for (const d of [draft({ amount: "" }), draft({ amount: "0" }), draft({ amount: "abc" }), draft({ accountId: "" })]) {
      expect(interpretDraft(d).kind).toBe("invalid");
    }
  });

  it("parses a transfer, rejecting self-transfers and non-positive amounts", () => {
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_save") }))).toEqual({ kind: "transfer", toAccountId: "a_save", cents: 5000 });
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_check") })).kind).toBe("invalid"); // self
    expect(interpretDraft(draft({ categoryId: transferSentinel("") })).kind).toBe("invalid"); // no target
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_save"), amount: "-50" })).kind).toBe("invalid");
  });

  it("parses income with the Payer default", () => {
    expect(interpretDraft(draft({ categoryId: "income" }))).toEqual({ kind: "income", cents: 5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "income", payee: "  " }))).toEqual({ kind: "income", cents: 5000, payee: "Income" });
  });

  it("signs a split parent by its direction toggle (line rules live in validateSplitDraft)", () => {
    expect(interpretDraft(draft({ categoryId: "split", splitDirection: "outflow" }))).toEqual({ kind: "split", cents: -5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "split", splitDirection: "inflow" }))).toEqual({ kind: "split", cents: 5000, payee: "Test" });
    // No direction supplied defaults to outflow-signed, matching the editor's default.
    expect(interpretDraft(draft({ categoryId: "split" }))).toEqual({ kind: "split", cents: -5000, payee: "Test" });
  });

  it("parses a normal outflow, negating the amount and defaulting the payee", () => {
    expect(interpretDraft(draft({ categoryId: "c_groc" }))).toEqual({ kind: "normal", categoryId: "c_groc", cents: -5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "", payee: "" }))).toEqual({ kind: "normal", categoryId: null, cents: -5000, payee: "Payee" });
  });

  it("never mistakes a real category id for a sentinel", () => {
    // A category whose id merely CONTAINS sentinel-ish text is still a normal category.
    const r = interpretDraft(draft({ categoryId: "cat_income_tax" }));
    expect(r.kind).toBe("normal");
  });
});
