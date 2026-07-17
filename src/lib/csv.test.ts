import { describe, expect, it } from "vitest";
import { parseCsv, normalizeDate, csvFingerprint } from "./csv";

describe("parseCsv", () => {
  it("parses a plain header + row", () => {
    expect(parseCsv("Date,Payee,Amount,Memo\n2026-01-05,Coffee Shop,-4.50,\n")).toEqual([
      ["Date", "Payee", "Amount", "Memo"],
      ["2026-01-05", "Coffee Shop", "-4.50", ""],
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCsv('Date,Payee,Amount,Memo\n2026-01-05,"Smith, John",-10.00,\n')).toEqual([
      ["Date", "Payee", "Amount", "Memo"],
      ["2026-01-05", "Smith, John", "-10.00", ""],
    ]);
  });

  it("handles an escaped double-quote inside a quoted field", () => {
    expect(parseCsv('Date,Payee,Amount,Memo\n2026-01-05,"Bob ""The Builder""",-10.00,\n')).toEqual([
      ["Date", "Payee", "Amount", "Memo"],
      ["2026-01-05", 'Bob "The Builder"', "-10.00", ""],
    ]);
  });

  it("handles CRLF line endings and a trailing row with no final newline", () => {
    expect(parseCsv("Date,Payee,Amount,Memo\r\n2026-01-05,Coffee,-4.50,morning")).toEqual([
      ["Date", "Payee", "Amount", "Memo"],
      ["2026-01-05", "Coffee", "-4.50", "morning"],
    ]);
  });
});

describe("normalizeDate", () => {
  it("passes an ISO date through unchanged", () => {
    expect(normalizeDate("2026-01-05")).toBe("2026-01-05");
  });

  it("converts MM/DD/YYYY to ISO", () => {
    expect(normalizeDate("1/5/2026")).toBe("2026-01-05");
    expect(normalizeDate("12/31/2026")).toBe("2026-12-31");
  });

  it("returns null for an unparseable date", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("2026/01/05")).toBeNull();
  });
});

describe("csvFingerprint", () => {
  it("is stable for identical rows (so re-importing the same file dedupes)", () => {
    const a = csvFingerprint("2026-07-01", "Coffee Shop", -450, "");
    const b = csvFingerprint("2026-07-01", "Coffee Shop", -450, "");
    expect(a).toBe(b);
  });

  it("differs when any field differs", () => {
    const base = csvFingerprint("2026-07-01", "Coffee Shop", -450, "");
    expect(csvFingerprint("2026-07-02", "Coffee Shop", -450, "")).not.toBe(base);
    expect(csvFingerprint("2026-07-01", "Tea Shop", -450, "")).not.toBe(base);
    expect(csvFingerprint("2026-07-01", "Coffee Shop", -451, "")).not.toBe(base);
    expect(csvFingerprint("2026-07-01", "Coffee Shop", -450, "morning")).not.toBe(base);
  });

  it("is prefixed so it can never collide with a real bank FITID", () => {
    expect(csvFingerprint("2026-07-01", "Coffee Shop", -450, "")).toMatch(/^csv:/);
  });
});
