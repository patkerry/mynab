import { createHash } from "crypto";

// Minimal quote-aware CSV parser for the generic transaction import (Date, Payee, Amount,
// Memo). No external dependency needed for a 4-column format — handles quoted fields
// (including commas and escaped "" quotes inside them) and both \n and \r\n line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\r") {
      // handled by the \n that follows (or end of input for a lone \r)
    } else if (ch === "\n") {
      pushRow();
    } else {
      field += ch;
    }
  }
  // Trailing row with no final newline
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// Accepts ISO "YYYY-MM-DD" as-is, converts "MM/DD/YYYY" (the other format we've actually seen,
// in the user's own YNAB export) to ISO, otherwise returns null so the caller can skip the row.
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (ISO_DATE_RE.test(s)) return s;
  const m = s.match(US_DATE_RE);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

// A plain CSV carries no bank-assigned transaction id, so re-importing an overlapping export
// (the same daily-download habit QFX handles via FITID) would otherwise insert every row again
// every time. This synthesizes a stable per-row fingerprint from its own content, reusing the
// same (accountId, externalId) unique constraint and skipDuplicates mechanism QFX imports use —
// prefixed "csv:" so it can never collide with a real bank FITID.
//
// Trade-off, inherent to fingerprint dedup for a format with no unique id: two genuinely
// different transactions that happen to share the exact same date/payee/amount/memo (e.g. two
// identical $4.50 coffees on the same day) will collide, and the second is dropped as a
// "duplicate" on a later import even though it's real. There's no way to tell them apart from
// the file content alone.
export function csvFingerprint(date: string, payee: string, amountCents: number, memo: string): string {
  const hash = createHash("sha256").update(`${date}|${payee}|${amountCents}|${memo}`).digest("hex").slice(0, 40);
  return `csv:${hash}`;
}
