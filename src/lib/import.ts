import "server-only";
import { prisma } from "@/lib/db";
import { parseMoney, uid } from "@/lib/format";
import { parseCsv, normalizeDate, csvFingerprint } from "@/lib/csv";
import { isQfx, parseQfx } from "@/lib/qfx";
import { buildHistoryMap, guessCategoryId, KNOWN_MERCHANTS } from "@/lib/merchant";
import { IMPORTED_TXN_STATE } from "@/lib/register";
import type { ImportResult } from "@/lib/types";

// The transaction-import pipeline (CSV + QFX/OFX), extracted from accounts/actions.ts so that
// file stays focused on transaction CRUD/reconciliation. The pure format parsing lives in csv.ts /
// qfx.ts and the category-guessing in merchant.ts; this module is the orchestration that joins them
// to the database. The Server Action `importTransactions` (accounts/actions.ts) owns auth
// (requireBudget) and cache revalidation and delegates the actual work to runImport() below.

const REQUIRED_IMPORT_HEADERS = ["date", "payee", "amount"];

type ImportRow = { date: string; payee: string; memo: string; amountCents: number; externalId: string | null };

// Generic CSV (Date, Payee, Amount, Memo — no account column, one file per account). Every row
// gets a synthesized fingerprint as its externalId (see csvFingerprint in src/lib/csv.ts) so
// re-importing an overlapping export doesn't re-insert rows already present.
function parseCsvImport(csvText: string): { rows: ImportRow[]; skipped: number } | { error: string } {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const missing = REQUIRED_IMPORT_HEADERS.filter((h) => colIndex(h) === -1);
  if (missing.length > 0) {
    return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  }
  const dateCol = colIndex("date");
  const payeeCol = colIndex("payee");
  const amountCol = colIndex("amount");
  const memoCol = colIndex("memo");

  const parsed: ImportRow[] = [];
  let skipped = 0;
  for (const raw of rows.slice(1)) {
    const date = normalizeDate(raw[dateCol] || "");
    const amountCents = parseMoney(raw[amountCol] || "");
    if (!date || !amountCents) {
      skipped++;
      continue;
    }
    const payee = (raw[payeeCol] || "").trim() || "Payee";
    const memo = memoCol === -1 ? "" : (raw[memoCol] || "").trim();
    parsed.push({ date, payee, memo, amountCents, externalId: csvFingerprint(date, payee, amountCents, memo) });
  }
  return { rows: parsed, skipped };
}

// Generic CSV or QFX/OFX (Quicken) import — format is detected from the file's own content
// (see isQfx in src/lib/qfx.ts), not its extension. Every row lands as pending (uncategorized,
// unapproved) but ALREADY CLEARED: a bank/card export is a record of settled transactions (every
// OFX <STMTTRN> carries a <DTPOSTED> date and there's no pending flag in the format), so marking
// them cleared on import is accurate and saves hand-clearing each one. The amount is reflected in
// the account balance immediately. A user reviews and approves each one (categorizes it) by opening
// and saving it in the register — the same edit flow every other
// transaction uses (see updateTransaction).
//
// QFX rows carry the bank's own FITID as externalId; CSV rows carry a synthesized content
// fingerprint (csvFingerprint in src/lib/csv.ts). Either way, rows whose externalId already
// exists for the account are skipped (see the pre-filter below), so re-importing a file with an
// overlapping date range — the normal way both banks and Quicken let you export — is a no-op for
// rows already present, instead of creating duplicate pending transactions.
//
// Caller contract: `budgetId` is the already-authorized active budget (accounts/actions.ts calls
// requireBudget("write") first). This function does NOT revalidate the Next cache — the calling
// Server Action does that on success, keeping framework concerns out of the domain logic.
export async function runImport(budgetId: string, accountId: string, fileText: string): Promise<ImportResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, budgetId } });
  if (!account) return { ok: false, reason: "Account not found." };

  let parsed: ImportRow[];
  let skipped: number;
  if (isQfx(fileText)) {
    const result = parseQfx(fileText);
    if (result.rows.length === 0) return { ok: false, reason: "No transactions found in this QFX file." };
    parsed = result.rows;
    skipped = result.skipped;
  } else {
    const result = parseCsvImport(fileText);
    if ("error" in result) return { ok: false, reason: result.error };
    parsed = result.rows;
    skipped = result.skipped;
  }
  if (parsed.length === 0) return { ok: false, reason: "No valid rows found in the file." };

  // createMany's `skipDuplicates` is a Postgres/MySQL-only Prisma feature — it throws on SQLite
  // (the Electron desktop build). So instead of leaning on the DB to drop rows that collide with
  // the (accountId, externalId) unique constraint, pre-filter here: skip any row whose externalId
  // already exists for this account (INCLUDING soft-deleted rows — they keep occupying their slot
  // on purpose, so a deleted transaction can't silently reappear on re-import; see deleteTransaction)
  // and any duplicate within this same file. Rows with a null externalId (e.g. a QFX row missing its
  // FITID) never collide in a unique constraint, so they're always inserted — matching how
  // skipDuplicates behaved. Works identically on Postgres and SQLite.
  const existing = await prisma.transaction.findMany({ where: { budgetId, accountId }, select: { externalId: true } });
  const seen = new Set<string>();
  for (const t of existing) if (t.externalId) seen.add(t.externalId);

  const toInsert = parsed.filter((r) => {
    if (r.externalId === null) return true;
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });

  // Guess a category for each imported (still-pending) row from the user's own history plus a
  // static seed of common merchants — a *suggestion* only: the row stays pending, so the guess
  // never counts against a budget until the user reviews and approves it (see updateTransaction).
  // History = every already-categorized transaction (this budget), majority-voted per merchant.
  const categorized = await prisma.transaction.findMany({
    where: { budgetId, deletedAt: null, kind: "NORMAL", categoryId: { not: null } },
    select: { payee: true, memo: true, categoryId: true },
  });
  const history = buildHistoryMap(categorized);
  // Resolve the KNOWN_MERCHANTS name->category seed to this budget's category ids (skip a payment
  // category or a name the user doesn't have). Non-payment categories only — a card's payment
  // category is never a transaction's own categoryId (see isPaymentCategory).
  const cats = await prisma.category.findMany({ where: { budgetId, linkedAccountId: null }, select: { id: true, name: true } });
  const idByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const seed = KNOWN_MERCHANTS.map((k) => ({ match: k.match, categoryId: idByName.get(k.category.toLowerCase()) }))
    .filter((s): s is { match: string; categoryId: string } => Boolean(s.categoryId));

  // One id shared by every row of this import, so "undo import" can remove the whole batch at once
  // (see undoImport in accounts/actions.ts).
  const importBatchId = uid("imp");

  const CHUNK = 500;
  let importedCount = 0;
  let guessedCount = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await prisma.transaction.createMany({
      data: chunk.map((r) => {
        const categoryId = guessCategoryId(r.payee, r.memo, r.amountCents, history, seed);
        if (categoryId) guessedCount++;
        return {
          budgetId,
          accountId,
          date: r.date,
          payee: r.payee,
          memo: r.memo,
          kind: "NORMAL" as const,
          categoryId,
          amountCents: r.amountCents,
          // Cleared-but-pending on import (see IMPORTED_TXN_STATE): an export only contains
          // transactions that already posted, but they still await human review. This exact pairing
          // is what keeps the register header's Uncleared sum over disjoint sets — see register.ts.
          ...IMPORTED_TXN_STATE,
          externalId: r.externalId,
          importBatchId,
        };
      }),
    });
    importedCount += result.count;
  }

  return { ok: true, imported: importedCount, duplicates: parsed.length - importedCount, skipped, guessed: guessedCount };
}
