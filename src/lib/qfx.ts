import { parseMoney } from "./format";
import { bestMerchant, isGenericBankPayee } from "./merchant";

// OFX 1.x (the common QFX variant produced by Quicken/bank downloads) is SGML, not XML — leaf
// tags like <TRNTYPE>DEBIT are frequently left unclosed, terminated only by a newline or the
// next tag. OFX 2.x is real XML with proper closing tags. This parser tolerates both.

// Content sniff (not file-extension based) so the import action can pick a parser regardless
// of what the file happens to be named.
export function isQfx(text: string): boolean {
  const head = text.slice(0, 400).toUpperCase();
  return head.includes("OFXHEADER") || head.includes("<OFX>");
}

// Matches <TAG>value</TAG> first (OFX 2.x / well-formed), falling back to <TAG>value up to a
// newline or the next tag (the common OFX 1.x unclosed-leaf-tag case).
function extractTag(block: string, tag: string): string | null {
  const closed = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  if (closed) return closed[1].trim();
  const open = block.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, "i"));
  return open ? open[1].trim() : null;
}

// DTPOSTED is YYYYMMDD, optionally followed by HHMMSS and/or a "[-5:EST]"-style offset — the
// date is always the first 8 characters regardless of what follows.
function normalizeOfxDate(raw: string): string | null {
  const digits = raw.slice(0, 8);
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export type QfxRow = { date: string; payee: string; memo: string; amountCents: number; externalId: string | null };

export function parseQfx(text: string): { rows: QfxRow[]; skipped: number } {
  const rows: QfxRow[] = [];
  let skipped = 0;

  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const block of blocks) {
    const rawDate = extractTag(block, "DTPOSTED");
    const rawAmount = extractTag(block, "TRNAMT");
    const date = rawDate ? normalizeOfxDate(rawDate) : null;
    const amountCents = rawAmount ? parseMoney(rawAmount) : 0;
    if (!date || !amountCents) {
      skipped++;
      continue;
    }
    const rawName = extractTag(block, "NAME") || extractTag(block, "PAYEE") || "Payee";
    const rawMemo = extractTag(block, "MEMO") || "";
    // Canadian banks (RBC) put boilerplate in NAME ("Visa Debit purchase - 4581") and the real
    // merchant in MEMO ("GIANT TIGER #17"). Promote the merchant to the payee so the register is
    // readable and category-guessing has a clean key; keep the original type note in the memo.
    const payee = bestMerchant(rawName, rawMemo);
    const memo = rawMemo && isGenericBankPayee(rawName) ? rawName : rawMemo;
    const externalId = extractTag(block, "FITID");
    rows.push({ date, payee, memo, amountCents, externalId });
  }

  return { rows, skipped };
}
