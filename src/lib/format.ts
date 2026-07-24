export const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);

export const monthKeyOf = (dateStr: string) => (dateStr || "").slice(0, 7);

export const addMonths = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-CA", { month: "long", year: "numeric" });
};

export const monthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-CA", { month: "short" });
};

export const dateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric" });
};

export const fmt = (cents: number | null | undefined) => {
  const v = (cents || 0) / 100;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
};

export const parseMoney = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  if (isNaN(n)) return 0;
  const cents = Math.round(n * 100);
  // amountCents is a Postgres int4 (±$21.4M). Out-of-range input returns 0 — every caller treats
  // 0 as "invalid amount" and rejects gracefully instead of throwing a raw DB error.
  return Math.abs(cents) > 2_000_000_000 ? 0 : cents;
};

export function curYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Today as local "YYYY-MM-DD". NOT `toISOString().slice(0,10)` — that's UTC, which dates any
// evening entry (after ~7-8pm Eastern) with TOMORROW. Same local-time discipline as
// dateLabel/monthLabel/curYM above.
export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// shared column template for the register header / rows / editor. Last column holds the row actions
// (approve / cleared toggle + delete) — wide enough for a labeled "Approve" button on pending rows.
export const TXN_GRID = "128px 0.8fr 150px 0.75fr 120px 104px 128px";
