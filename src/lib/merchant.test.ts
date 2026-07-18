import { describe, expect, it } from "vitest";
import { isGenericBankPayee, bestMerchant, normalizeMerchant, buildHistoryMap, guessCategoryId, KNOWN_MERCHANTS } from "./merchant";

describe("isGenericBankPayee", () => {
  it("flags RBC-style boilerplate", () => {
    expect(isGenericBankPayee("Visa Debit purchase - 4581")).toBe(true);
    expect(isGenericBankPayee("Contactless Interac purchase - 0883")).toBe(true);
    expect(isGenericBankPayee("ATM withdrawal - 92141506")).toBe(true);
    expect(isGenericBankPayee("Payroll Deposit")).toBe(true);
    expect(isGenericBankPayee("e-Transfer received")).toBe(true);
  });
  it("leaves real merchant names alone", () => {
    expect(isGenericBankPayee("GIANT TIGER #17")).toBe(false);
    expect(isGenericBankPayee("DISNEY PLUS")).toBe(false);
    expect(isGenericBankPayee("Starbucks")).toBe(false);
  });
});

describe("bestMerchant", () => {
  it("promotes the memo when the payee is boilerplate", () => {
    expect(bestMerchant("Visa Debit purchase - 3887", "WWW COSTCO CA")).toBe("WWW COSTCO CA");
  });
  it("keeps the payee when it's already the merchant (CSV / non-RBC)", () => {
    expect(bestMerchant("Starbucks", "coffee")).toBe("Starbucks");
  });
  it("keeps the payee when boilerplate but there's no memo", () => {
    expect(bestMerchant("Payroll Deposit", "")).toBe("Payroll Deposit");
  });
});

describe("normalizeMerchant", () => {
  it("strips store numbers and terminal refs, uppercases", () => {
    expect(normalizeMerchant("GIANT TIGER #17")).toBe("GIANT TIGER");
    expect(normalizeMerchant("Visa Debit purchase - 4581")).toBe("VISA DEBIT PURCHASE");
    expect(normalizeMerchant("WWW COSTCO CA")).toBe("WWW COSTCO CA");
  });
  it("maps two occurrences of the same store to the same key", () => {
    expect(normalizeMerchant("GIANT TIGER #17")).toBe(normalizeMerchant("GIANT TIGER #17"));
  });
});

describe("buildHistoryMap + guessCategoryId", () => {
  const seed = [{ match: "COSTCO", categoryId: "c_groc" }];

  it("uses history (exact merchant) over the seed", () => {
    const history = buildHistoryMap([
      { payee: "Visa Debit purchase - 1", memo: "WWW COSTCO CA", categoryId: "c_custom" },
    ]);
    // user filed Costco under a custom category — history wins over the seed's Groceries
    expect(guessCategoryId("Visa Debit purchase - 2", "WWW COSTCO CA", -5000, history, seed)).toBe("c_custom");
  });

  it("falls back to the seed when there's no history", () => {
    expect(guessCategoryId("Visa Debit purchase - 9", "WWW COSTCO CA", -5000, new Map(), seed)).toBe("c_groc");
  });

  it("majority vote survives a single stray miscategorization", () => {
    const history = buildHistoryMap([
      { payee: "Interac purchase - 1", memo: "GIANT TIGER #17", categoryId: "c_groc" },
      { payee: "Interac purchase - 2", memo: "GIANT TIGER #17", categoryId: "c_groc" },
      { payee: "Interac purchase - 3", memo: "GIANT TIGER #17", categoryId: "c_oops" },
    ]);
    expect(history.get("GIANT TIGER")).toBe("c_groc");
  });

  it("never guesses for inflows (income/refunds)", () => {
    const history = buildHistoryMap([{ payee: "Visa Debit purchase - 1", memo: "WWW COSTCO CA", categoryId: "c_groc" }]);
    expect(guessCategoryId("Visa Debit purchase - 2", "WWW COSTCO CA", 5000, history, seed)).toBeNull();
  });

  it("returns null for an unknown one-off merchant", () => {
    expect(guessCategoryId("Visa Debit purchase - 7", "PHOENIX DIGITAL", -1000, new Map(), seed)).toBeNull();
  });
});

describe("KNOWN_MERCHANTS ordering", () => {
  it("classifies delivery before groceries (DoorDash from No Frills = dining)", () => {
    const doordash = KNOWN_MERCHANTS.findIndex((k) => k.match === "DOORDASH");
    const nofrills = KNOWN_MERCHANTS.findIndex((k) => k.match === "NO FRILLS");
    expect(doordash).toBeLessThan(nofrills);
  });
  it("classifies UBER EATS before UBER", () => {
    const eats = KNOWN_MERCHANTS.findIndex((k) => k.match === "UBER EATS");
    const uber = KNOWN_MERCHANTS.findIndex((k) => k.match === "UBER");
    expect(eats).toBeLessThan(uber);
  });
});
