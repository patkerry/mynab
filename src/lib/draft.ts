import { parseMoney } from "./format";
import type { TxnDraft } from "./types";

// THE single interpreter for TxnDraft.categoryId's overloaded sentinel string:
//   "income" | "" (uncategorized) | "split" | "transfer:<accountId>" | a real category id
// Before this existed, `.startsWith("transfer:")` / `.slice(9)` / `=== "income"` parsing was
// scattered across the editor, both write actions, and the duplicate check (~30 switch sites) —
// one prefix typo away from silently turning a transfer into an uncategorized transaction.
// Pure and unit-tested (draft.test.ts); the actions switch on the returned union instead.

export const TRANSFER_PREFIX = "transfer:";
export const transferSentinel = (accountId: string) => TRANSFER_PREFIX + accountId;

export type InterpretedDraft =
  | { kind: "transfer"; toAccountId: string; cents: number } // cents > 0; legs are -cents / +cents
  | { kind: "income"; cents: number; payee: string } // signed as entered (inflow positive)
  | { kind: "split"; cents: number; payee: string } // parent amount signed by splitDirection; line rules live in validateSplitDraft
  | { kind: "normal"; categoryId: string | null; cents: number; payee: string } // cents already negated (outflow)
  | { kind: "invalid"; reason: string };

export function interpretDraft(draft: TxnDraft): InterpretedDraft {
  const cents = parseMoney(draft.amount);
  if (!cents || !draft.accountId) return { kind: "invalid", reason: "Enter an amount." };

  if (draft.categoryId.startsWith(TRANSFER_PREFIX)) {
    // A transfer's direction is fully expressed by which account is source vs destination —
    // a negative amount would let a same-signed pair of legs get flipped, which the engine's
    // `amountCents > 0 = payment landing on a card` check would misread.
    if (cents <= 0) return { kind: "invalid", reason: "Transfers need a positive amount." };
    const toAccountId = draft.categoryId.slice(TRANSFER_PREFIX.length);
    if (!toAccountId || toAccountId === draft.accountId) {
      return { kind: "invalid", reason: "Can't transfer an account to itself — pick a different destination account." };
    }
    return { kind: "transfer", toAccountId, cents };
  }

  if (draft.categoryId === "income") {
    return { kind: "income", cents, payee: draft.payee.trim() || "Income" };
  }

  if (draft.categoryId === "split") {
    // The parent's sign comes from the direction toggle; the authoritative total is still
    // validateSplitDraft's (lines must sum to it) — this cents is for advisory uses like the
    // duplicate check.
    return { kind: "split", cents: draft.splitDirection === "inflow" ? cents : -cents, payee: draft.payee.trim() || "Payee" };
  }

  return { kind: "normal", categoryId: draft.categoryId || null, cents: -cents, payee: draft.payee.trim() || "Payee" };
}
