// Merchant extraction + category guessing for imports.
//
// Canadian bank exports (RBC especially) put boilerplate in the OFX <NAME> field ("Visa Debit
// purchase - 4581") and the actual merchant in <MEMO> ("GIANT TIGER #17"). This module (a) picks
// the best merchant string to display, (b) normalizes it into a stable key, and (c) guesses a
// category from the user's own categorization history plus a static seed of common merchants.
// It's pure/DB-free so it can be unit-tested and reused by both the QFX parser and the importer.

// A payee that describes the *mechanism* of a transaction rather than a merchant — the tell that
// the real merchant is hiding in the memo. Deliberately broad but only matches whole words, so a
// genuine merchant named "... Payments Ltd" still reads as generic (correct — it usually is).
const GENERIC_PAYEE =
  /\b(purchase|withdrawal|deposit|correction|transfer|payment|refund|reversal|fee|interac|e-?transfer|pre-?auth|preauthorized|bill\s*payment|cheque|check|overdraft|nsf|service\s*charge)\b/i;

export function isGenericBankPayee(name: string): boolean {
  return GENERIC_PAYEE.test(name.trim());
}

// The merchant to display/match on: the memo when the payee is bank boilerplate and a memo
// exists, otherwise the payee itself (the normal case for CSV and non-RBC banks, where the payee
// already IS the merchant).
export function bestMerchant(payee: string, memo: string): string {
  const p = (payee || "").trim();
  const m = (memo || "").trim();
  if (m && isGenericBankPayee(p)) return m;
  return p;
}

// Stable key for matching. Conservative: uppercases, strips store/terminal numbers ("#17",
// " - 4581") and surrounding punctuation, collapses whitespace. Does NOT merge merchant families
// (all DoorDash variants stay distinct) — that's left to the KNOWN_MERCHANTS substring seed.
export function normalizeMerchant(s: string): string {
  return (s || "")
    .toUpperCase()
    .replace(/#\s*\d+/g, " ") // store numbers "#17"
    .replace(/\s[-–]\s*\d+\s*$/g, "") // trailing terminal ref " - 4581"
    .replace(/[^A-Z0-9&'/. ]+/g, " ") // punctuation -> space (keep & ' / . as they appear in names)
    .replace(/\s+/g, " ")
    .trim();
}

// Static seed so a FIRST import (no history yet) is still mostly categorized. Maps a substring
// (matched case-insensitively against the merchant) to a category NAME — resolved to this DB's
// category id at import time, skipped if the user has no such category. ORDER MATTERS: earlier
// entries win, so delivery/restaurant chains are listed before grocery chains (a "DoorDash from
// No Frills" charge is dining, not groceries).
export type KnownMerchant = { match: string; category: string };
export const KNOWN_MERCHANTS: KnownMerchant[] = [
  // Dining / delivery (before groceries so DOORDASH*NOFRILL etc. lands here)
  { match: "DOORDASH", category: "Dining Out" },
  { match: "UBER EATS", category: "Dining Out" },
  { match: "UBEREATS", category: "Dining Out" },
  { match: "SKIP", category: "Dining Out" },
  { match: "MCDONALD", category: "Dining Out" },
  { match: "TIM HORTON", category: "Dining Out" },
  { match: "STARBUCKS", category: "Dining Out" },
  { match: "A&W", category: "Dining Out" },
  { match: "WENDY", category: "Dining Out" },
  { match: "BURGER KING", category: "Dining Out" },
  { match: "SUBWAY", category: "Dining Out" },
  { match: "PIZZA", category: "Dining Out" },
  { match: "RESTAURANT", category: "Dining Out" },
  { match: "KITCHEN", category: "Dining Out" },
  { match: "CAFE", category: "Dining Out" },
  { match: "SUSHI", category: "Dining Out" },
  // Subscriptions
  { match: "NETFLIX", category: "Subscriptions" },
  { match: "DISNEY", category: "Subscriptions" },
  { match: "SPOTIFY", category: "Subscriptions" },
  { match: "APPLE.COM", category: "Subscriptions" },
  { match: "NINTENDO", category: "Subscriptions" },
  { match: "PRIME VIDEO", category: "Subscriptions" },
  { match: "AMAZON PRIME", category: "Subscriptions" },
  { match: "YOUTUBE", category: "Subscriptions" },
  { match: "AD FREE", category: "Subscriptions" },
  { match: "CRAVE", category: "Subscriptions" },
  { match: "AUDIBLE", category: "Subscriptions" },
  { match: "ADOBE", category: "Subscriptions" },
  { match: "PATREON", category: "Subscriptions" },
  // Groceries
  { match: "COSTCO", category: "Groceries" },
  { match: "WALMART", category: "Groceries" },
  { match: "GIANT TIGER", category: "Groceries" },
  { match: "LOBLAW", category: "Groceries" },
  { match: "NO FRILLS", category: "Groceries" },
  { match: "SOBEYS", category: "Groceries" },
  { match: "METRO", category: "Groceries" },
  { match: "FRESHCO", category: "Groceries" },
  { match: "SUPERSTORE", category: "Groceries" },
  { match: "FOOD BASICS", category: "Groceries" },
  { match: "SAFEWAY", category: "Groceries" },
  { match: "ZEHRS", category: "Groceries" },
  { match: "FARM BOY", category: "Groceries" },
  { match: "WHOLE FOODS", category: "Groceries" },
  // Pharmacy / medical
  { match: "SHOPPERS DRUG", category: "Medical" },
  { match: "REXALL", category: "Medical" },
  { match: "PHARMA", category: "Medical" },
  { match: "JEAN COUTU", category: "Medical" },
  { match: "DENTAL", category: "Medical" },
  // Insurance
  { match: "INSURAN", category: "Insurance" },
  { match: "PRIMMUM", category: "Insurance" },
  { match: "INTACT", category: "Insurance" },
  { match: "SONNET", category: "Insurance" },
  { match: "BELAIR", category: "Insurance" },
  // Transportation / fuel
  { match: "PETRO", category: "Transportation" },
  { match: "ESSO", category: "Transportation" },
  { match: "SHELL", category: "Transportation" },
  { match: "ULTRAMAR", category: "Transportation" },
  { match: "HUSKY", category: "Transportation" },
  { match: "PARKING", category: "Transportation" },
  { match: "PRESTO", category: "Transportation" },
  { match: "LYFT", category: "Transportation" },
  { match: "UBER", category: "Transportation" }, // after "UBER EATS"
  // Phone / internet
  { match: "ROGERS", category: "Phone" },
  { match: "BELL ", category: "Phone" },
  { match: "TELUS", category: "Phone" },
  { match: "FIDO", category: "Phone" },
  { match: "KOODO", category: "Phone" },
  { match: "FREEDOM", category: "Phone" },
  { match: "VIRGIN", category: "Phone" },
  // Alcohol -> Fun Money
  { match: "LCBO", category: "Fun Money" },
  { match: "ALCOOL", category: "Fun Money" },
  { match: "SAQ", category: "Fun Money" },
  { match: "BEER STORE", category: "Fun Money" },
];

// A category guess: exact history-key match first (the user's own past choices), then the static
// seed as a substring fallback. `history` maps normalizeMerchant(...) -> categoryId (majority
// vote, built by the caller from already-categorized transactions). `seed` maps a substring to a
// categoryId (KNOWN_MERCHANTS resolved to this DB's ids). Only outflows are guessed — a positive
// amount is income/refund, not a spending category. Returns null when nothing is confident.
export function guessCategoryId(
  payee: string,
  memo: string,
  amountCents: number,
  history: Map<string, string>,
  seed: { match: string; categoryId: string }[],
): string | null {
  if (amountCents >= 0) return null;
  const merchant = bestMerchant(payee, memo);
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  const fromHistory = history.get(key);
  if (fromHistory) return fromHistory;
  const upper = merchant.toUpperCase();
  for (const s of seed) {
    if (upper.includes(s.match) || key.includes(s.match)) return s.categoryId;
  }
  return null;
}

// Builds the history map from already-categorized transactions: for each merchant key, the
// most-frequently-chosen categoryId wins (so one stray miscategorization can't flip a merchant
// the user has correctly filed many times). Ties break toward the most recent by input order.
export function buildHistoryMap(
  txns: { payee: string; memo: string; categoryId: string | null }[],
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    const key = normalizeMerchant(bestMerchant(t.payee, t.memo));
    if (!key) continue;
    let byCat = counts.get(key);
    if (!byCat) counts.set(key, (byCat = new Map()));
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [key, byCat] of counts) {
    let bestCat = "";
    let bestN = -1;
    for (const [cat, n] of byCat) {
      if (n > bestN) {
        bestN = n;
        bestCat = cat;
      }
    }
    result.set(key, bestCat);
  }
  return result;
}
