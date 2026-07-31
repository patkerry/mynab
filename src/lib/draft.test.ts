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

  it("parses a transfer, rejecting self-transfers", () => {
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_save") }))).toEqual({ kind: "transfer", toAccountId: "a_save", cents: 5000, direction: "outflow" });
    // Inflow = money arriving INTO the current account from the other one.
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_save"), direction: "inflow" }))).toEqual({ kind: "transfer", toAccountId: "a_save", cents: 5000, direction: "inflow" });
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_check") })).kind).toBe("invalid"); // self
    expect(interpretDraft(draft({ categoryId: transferSentinel("") })).kind).toBe("invalid"); // no target
    // A typed minus never signs a transfer — cents are absolute, direction picks the side.
    expect(interpretDraft(draft({ categoryId: transferSentinel("a_save"), amount: "-50" }))).toEqual({ kind: "transfer", toAccountId: "a_save", cents: 5000, direction: "outflow" });
  });

  it("the direction toggle is the ONLY sign authority — a typed minus never double-negates", () => {
    // Regression: toggle on "−" (outflow) + typed "-45.00" used to save a +$45 refund
    // (−1 × −4500). The typed sign is absolute-valued away; direction alone signs the result.
    expect(interpretDraft(draft({ categoryId: "c_groc", amount: "-45.00" }))).toEqual({ kind: "normal", categoryId: "c_groc", cents: -4500, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "c_groc", amount: "-45.00", direction: "inflow" }))).toEqual({ kind: "normal", categoryId: "c_groc", cents: 4500, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "split", amount: "-45.00" }))).toEqual({ kind: "split", cents: -4500, payee: "Test" });
    // Income is always a positive inflow — a typed minus can't create RTA-draining negative income.
    expect(interpretDraft(draft({ categoryId: "income", amount: "-45.00" }))).toEqual({ kind: "income", cents: 4500, payee: "Test" });
  });

  it("parses income with the Payer default", () => {
    expect(interpretDraft(draft({ categoryId: "income" }))).toEqual({ kind: "income", cents: 5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "income", payee: "  " }))).toEqual({ kind: "income", cents: 5000, payee: "Income" });
  });

  it("signs a split parent by its direction toggle (line rules live in validateSplitDraft)", () => {
    expect(interpretDraft(draft({ categoryId: "split", direction: "outflow" }))).toEqual({ kind: "split", cents: -5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "split", direction: "inflow" }))).toEqual({ kind: "split", cents: 5000, payee: "Test" });
    // No direction supplied defaults to outflow-signed, matching the editor's default.
    expect(interpretDraft(draft({ categoryId: "split" }))).toEqual({ kind: "split", cents: -5000, payee: "Test" });
  });

  it("parses a normal outflow, negating the amount and defaulting the payee", () => {
    expect(interpretDraft(draft({ categoryId: "c_groc" }))).toEqual({ kind: "normal", categoryId: "c_groc", cents: -5000, payee: "Test" });
    expect(interpretDraft(draft({ categoryId: "", payee: "" }))).toEqual({ kind: "normal", categoryId: null, cents: -5000, payee: "Payee" });
  });

  it("a normal row with direction inflow is a categorized inflow (refund) — positive cents", () => {
    expect(interpretDraft(draft({ categoryId: "c_groc", direction: "inflow" }))).toEqual({ kind: "normal", categoryId: "c_groc", cents: 5000, payee: "Test" });
  });

  it("never mistakes a real category id for a sentinel", () => {
    // A category whose id merely CONTAINS sentinel-ish text is still a normal category.
    const r = interpretDraft(draft({ categoryId: "cat_income_tax" }));
    expect(r.kind).toBe("normal");
  });
});
