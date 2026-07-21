import { describe, it, expect } from "vitest";
import { parseAllowedEmails, isEmailAllowed } from "./auth-allowlist";

describe("parseAllowedEmails", () => {
  it("returns an empty set for undefined or blank input", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
    expect(parseAllowedEmails("").size).toBe(0);
    expect(parseAllowedEmails("  , ,  ").size).toBe(0);
  });

  it("splits, trims, lowercases, and drops empties", () => {
    const set = parseAllowedEmails(" Alice@Example.com , bob@test.dev ,, ");
    expect([...set].sort()).toEqual(["alice@example.com", "bob@test.dev"]);
  });
});

describe("isEmailAllowed", () => {
  it("allows everyone when the allowlist is empty (open sign-up)", () => {
    const set = parseAllowedEmails(undefined);
    expect(isEmailAllowed(set, "anyone@anywhere.com")).toBe(true);
  });

  it("permits only listed addresses, case-insensitively, when the allowlist is set", () => {
    const set = parseAllowedEmails("me@example.com, partner@example.com");
    expect(isEmailAllowed(set, "me@example.com")).toBe(true);
    expect(isEmailAllowed(set, "  ME@Example.com ")).toBe(true);
    expect(isEmailAllowed(set, "partner@example.com")).toBe(true);
    expect(isEmailAllowed(set, "stranger@example.com")).toBe(false);
  });
});
