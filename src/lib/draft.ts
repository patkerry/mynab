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
  // cents > 0 (unsigned). `direction` is the CURRENT account's side: "outflow" (default) = money
  // leaves this account for toAccountId; "inflow" = money arrives here FROM toAccountId.
  | { kind: "transfer"; toAccountId: string; cents: number; direction: "inflow" | "outflow" }
  | { kind: "income"; cents: number; payee: string } // always positive (income is an inflow; the toggle is hidden for it)
  | { kind: "split"; cents: number; payee: string } // parent amount signed by splitDirection; line rules live in validateSplitDraft
  | { kind: "normal"; categoryId: string | null; cents: number; payee: string } // cents signed by draft.direction (outflow default)
  | { kind: "invalid"; reason: string };

export function interpretDraft(draft: TxnDraft): InterpretedDraft {
  // The −/+ direction toggle is the ONLY sign authority. A minus sign typed into the amount field
  // is ignored (absolute value), never multiplied with the toggle: with the toggle already showing
  // "−", a typed "-45.00" used to double-negate into a +$45 refund that Reports counted as income.
  // (The editor also flips the toggle to outflow when a minus is typed — see TxnEditorRow — so a
  // typed sign still expresses intent; it just can't contradict what's displayed.)
  const cents = Math.abs(parseMoney(draft.amount));
  if (!cents || !draft.accountId) return { kind: "invalid", reason: "Enter an amount." };

  if (draft.categoryId.startsWith(TRANSFER_PREFIX)) {
    // A transfer's direction is fully expressed by which account is source vs destination —
    // `direction` picks the side; the legs are signed from it (never from typed input, per above),
    // so the engine's `amountCents > 0 = payment landing on a card` check can't be misread.
    const toAccountId = draft.categoryId.slice(TRANSFER_PREFIX.length);
    if (!toAccountId || toAccountId === draft.accountId) {
      return { kind: "invalid", reason: "Can't transfer an account to itself — pick a different destination account." };
    }
    return { kind: "transfer", toAccountId, cents, direction: draft.direction === "inflow" ? "inflow" : "outflow" };
  }

  if (draft.categoryId === "income") {
    return { kind: "income", cents, payee: draft.payee.trim() || "Income" };
  }

  const sign = draft.direction === "inflow" ? 1 : -1;

  if (draft.categoryId === "split") {
    // The parent's sign comes from the direction toggle; the authoritative total is still
    // validateSplitDraft's (lines must sum to it) — this cents is for advisory uses like the
    // duplicate check.
    return { kind: "split", cents: sign * cents, payee: draft.payee.trim() || "Payee" };
  }

  // A categorized inflow (direction "inflow" + category) is a refund; outflow is spending.
  return { kind: "normal", categoryId: draft.categoryId || null, cents: sign * cents, payee: draft.payee.trim() || "Payee" };
}
