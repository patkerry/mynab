export const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);

export const monthKeyOf = (dateStr: string) => (dateStr || "").slice(0, 7);

export const addMonths = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

export const monthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};

export const dateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmt = (cents: number | null | undefined) => {
  const v = (cents || 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
};

export const parseMoney = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
};

export function curYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// shared column template for the register header / rows / editor
export const TXN_GRID = "84px 1.1fr 120px 1fr 120px 104px 56px";
