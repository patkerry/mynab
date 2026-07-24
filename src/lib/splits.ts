import { parseMoney } from "./format";
import type { AccountType } from "@/generated/prisma-postgres/client";

// Pure split-transaction rules, kept out of the server-only action layer so both the editor
// (client-side pre-check) and accounts/actions.ts (authoritative server check) run the SAME
// validation, and so the rules — especially the no-RTA-line-on-credit-cards guard — are
// unit-testable without a database (same reasoning as register.ts).

// One editor line of a split draft. `categoryId` here is the UI sentinel: "income" means a
// Ready-to-Assign (income) line; anything else must be a real, budget-owned, non-payment
// category id. "" / "split" / "transfer:*" are never valid on a line.
export type SplitLineDraft = { categoryId: string; amount: string; memo?: string };

// A validated line ready to persist: categoryId null = RTA line; amountCents signed the same
// way Transaction.amountCents is (outflow negative, inflow positive).
export type ParsedSplitLine = { categoryId: string | null; amountCents: number; memo: string };

export type SplitValidation =
  | { ok: true; lines: ParsedSplitLine[]; totalCents: number }
  | { ok: false; reason: string };

// Lines are entered UNSIGNED in the editor; `direction` signs them all at once. Mixed-sign
// splits (an outflow row containing an inflow line) are deliberately out of scope — one real
// bank movement has one direction, and the rare cashback-style counterexample isn't worth the
// sign-entry confusion.
export function validateSplitDraft(opts: {
  lines: SplitLineDraft[];
  direction: "inflow" | "outflow";
  parentAmount: string; // the editor's total field, unsigned dollars as typed
  accountType: AccountType;
  paymentCategoryIds: ReadonlySet<string>; // categories with linkedAccountId != null
  validCategoryIds: ReadonlySet<string>; // budget-scoped, non-payment category ids
}): SplitValidation {
  const { lines, direction, parentAmount, accountType, paymentCategoryIds, validCategoryIds } = opts;

  if (lines.length < 2) return { ok: false, reason: "A split needs at least two lines — otherwise just pick the category." };

  const sign = direction === "outflow" ? -1 : 1;
  const parsed: ParsedSplitLine[] = [];
  for (const line of lines) {
    const cents = parseMoney(line.amount);
    if (cents <= 0) return { ok: false, reason: "Every split line needs an amount greater than zero." };
    if (line.categoryId === "income") {
      // The engine deliberately does not model income posted directly to a card account — doing
      // so double-counts (once via totalIncome, once via the payment category). See the
      // documented lesson in ARCHITECTURE.md; do not "fix" this here.
      if (accountType === "CREDIT") {
        return { ok: false, reason: "A Ready to Assign line isn't allowed on a credit card — categorize every line instead." };
      }
      parsed.push({ categoryId: null, amountCents: sign * cents, memo: (line.memo || "").trim() });
      continue;
    }
    if (paymentCategoryIds.has(line.categoryId)) {
      return { ok: false, reason: "Payment categories are managed automatically and can't be a split line." };
    }
    if (!validCategoryIds.has(line.categoryId)) {
      return { ok: false, reason: "Every split line needs a category (or Ready to Assign)." };
    }
    parsed.push({ categoryId: line.categoryId, amountCents: sign * cents, memo: (line.memo || "").trim() });
  }

  const totalCents = parsed.reduce((s, l) => s + l.amountCents, 0);
  const expected = sign * parseMoney(parentAmount);
  if (expected === 0) return { ok: false, reason: "Enter the transaction's total amount." };
  if (totalCents !== expected) {
    return { ok: false, reason: "Split lines must add up exactly to the transaction amount." };
  }

  return { ok: true, lines: parsed, totalCents };
}

// A split is coherent iff its lines sum EXACTLY to the parent's signed amount. Enforced at write
// time by validateSplitDraft, but re-checked wherever a split changes state (approvePending,
// the register's approvable predicate): approving or clearing an incoherent split
// would put money into categories that never left the account. Shared so the client checkbox
// and the bulk approve can't disagree about what "coherent" means.
export function splitsSumToParent(parentAmountCents: number, lines: readonly { amountCents: number }[]): boolean {
  return lines.reduce((s, l) => s + l.amountCents, 0) === parentAmountCents;
}

// Groups split rows by their parent transaction id. Shared by the engine (computeDerived),
// reports (expandSplits), and any caller that needs "does this transaction have lines?".
export function buildSplitsByTransaction<S extends { transactionId: string }>(splits: S[]): Map<string, S[]> {
  const byTxn = new Map<string, S[]>();
  for (const s of splits) {
    const list = byTxn.get(s.transactionId);
    if (list) list.push(s);
    else byTxn.set(s.transactionId, [s]);
  }
  return byTxn;
}
