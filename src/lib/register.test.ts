import { describe, expect, it } from "vitest";
import { IMPORTED_TXN_STATE, isUncleared, isPending } from "./register";

// Locks the state rule the register header's "Uncleared" figure (unclearedCents + pendingCents)
// depends on. This does NOT test the Prisma aggregates in getAccountTransactions — those need a DB
// the project has no harness for — it tests the pure invariant those aggregates rely on: that
// imported rows are simultaneously cleared and pending, which is what makes the two buckets disjoint.

describe("register state invariant", () => {
  it("imported rows post cleared AND pending", () => {
    expect(IMPORTED_TXN_STATE.cleared).toBe(true);
    expect(IMPORTED_TXN_STATE.pending).toBe(true);
  });

  it("an imported row is in the pending bucket but NOT the uncleared bucket (disjoint — no double-count)", () => {
    const imported = { ...IMPORTED_TXN_STATE, amountCents: -5000 };
    expect(isPending(imported)).toBe(true);
    expect(isUncleared(imported)).toBe(false);
  });

  it("approving a pending row removes it from the outstanding total exactly once", () => {
    // Approval clears `pending` and keeps `cleared: true` (see approvePending / updateTransaction).
    const approved = { ...IMPORTED_TXN_STATE, pending: false, amountCents: -5000 };
    // It leaves the pending bucket and never enters the uncleared bucket, so its amount is
    // subtracted from Uncleared once and only once — the money now shows only in the cleared Balance.
    expect(isPending(approved)).toBe(false);
    expect(isUncleared(approved)).toBe(false);
  });

  it("a genuinely uncleared (manually-unmarked) row is in the uncleared bucket only", () => {
    const uncleared = { cleared: false, pending: false, amountCents: -3000 };
    expect(isUncleared(uncleared)).toBe(true);
    expect(isPending(uncleared)).toBe(false);
  });
});
