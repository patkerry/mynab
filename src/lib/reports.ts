import { monthKeyOf, monthShort, addMonths } from "./format";
import type { Transaction, Category, BudgetEntry } from "@/generated/prisma-postgres/client";

// Reporting is a pure layer over the same all-time, unfiltered rows the budget engine uses. Every
// function takes a `months` window (array of "YYYY-MM") and filters to it — so the date-range control
// is just a different window, no new queries. Money in report series is DOLLARS (matches the chart
// formatter); the KPI summary returns cents (formatted with fmt() in the view).

// A "spend" row: a NORMAL outflow with a category. Mirrors the classification the original reports
// page used (income = INCOME kind, or a positive categorized NORMAL row).
const isSpend = (t: Transaction) => t.kind === "NORMAL" && t.amountCents < 0 && t.categoryId !== null;
const isIncome = (t: Transaction) =>
  t.kind === "INCOME" || (t.amountCents > 0 && t.kind === "NORMAL" && t.categoryId !== null);

export type ReportRange = "1m" | "3m" | "6m" | "12m" | "ytd";
export const RANGES: { key: ReportRange; label: string }[] = [
  { key: "1m", label: "This month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "ytd", label: "Year to date" },
];

// Trailing window of N months ending at `current`, or Jan..current for YTD. Oldest first.
export function monthsForRange(range: ReportRange, current: string): string[] {
  const n = range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : range === "12m" ? 12 : 0;
  if (n > 0) {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) out.push(addMonths(current, -i));
    return out;
  }
  const year = current.slice(0, 4);
  const lastMonth = Number(current.slice(5, 7));
  const out: string[] = [];
  for (let m = 1; m <= lastMonth; m++) out.push(`${year}-${String(m).padStart(2, "0")}`);
  return out;
}

export type Summary = { incomeCents: number; spendingCents: number; netCents: number; savingsRate: number };
export function summary(txns: Transaction[], months: string[]): Summary {
  const win = new Set(months);
  let income = 0;
  let spending = 0;
  for (const t of txns) {
    if (!win.has(monthKeyOf(t.date))) continue;
    if (isIncome(t)) income += t.amountCents;
    else if (isSpend(t)) spending += Math.abs(t.amountCents);
  }
  const netCents = income - spending;
  return { incomeCents: income, spendingCents: spending, netCents, savingsRate: income > 0 ? netCents / income : 0 };
}

export type CatSlice = { id: string; name: string; value: number };
export function spendByCategory(txns: Transaction[], cats: Category[], months: string[]): CatSlice[] {
  const win = new Set(months);
  const by = new Map<string, number>();
  for (const t of txns) {
    if (win.has(monthKeyOf(t.date)) && isSpend(t)) by.set(t.categoryId!, (by.get(t.categoryId!) || 0) + Math.abs(t.amountCents));
  }
  return [...by.entries()]
    .map(([id, v]) => ({ id, name: cats.find((c) => c.id === id)?.name || "?", value: v / 100 }))
    .sort((a, b) => b.value - a.value);
}

export function incomeVsSpending(txns: Transaction[], months: string[]) {
  return months.map((ym) => {
    let inc = 0;
    let exp = 0;
    for (const t of txns) {
      if (monthKeyOf(t.date) !== ym) continue;
      if (isIncome(t)) inc += t.amountCents;
      else if (isSpend(t)) exp += Math.abs(t.amountCents);
    }
    return { name: monthShort(ym), Income: inc / 100, Spending: exp / 100 };
  });
}

// Cumulative net worth at each month-end in the window (all rows dated on/before that month-end).
export function netWorthTrend(txns: Transaction[], months: string[]) {
  return months.map((ym) => {
    const end = ym + "-31";
    const nw = txns.filter((t) => t.date <= end).reduce((s, t) => s + t.amountCents, 0);
    return { name: monthShort(ym), value: nw / 100 };
  });
}

const TOP_N_TREND = 6;
export type TrendSeries = { key: string; name: string };
// Per-month spend for the top-6 categories over the window; everything else folds into "Other" (never
// a cycled 9th hue). Series are keyed by category id (names can collide) with a display name.
export function categorySpendTrend(txns: Transaction[], cats: Category[], months: string[]) {
  const win = new Set(months);
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (win.has(monthKeyOf(t.date)) && isSpend(t)) totals.set(t.categoryId!, (totals.get(t.categoryId!) || 0) + Math.abs(t.amountCents));
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const topIds = new Set(ranked.slice(0, TOP_N_TREND).map(([id]) => id));
  const hasOther = ranked.length > TOP_N_TREND;
  const series: TrendSeries[] = ranked.slice(0, TOP_N_TREND).map(([id]) => ({ key: id, name: cats.find((c) => c.id === id)?.name || "?" }));
  if (hasOther) series.push({ key: "__other", name: "Other" });

  const data = months.map((ym) => {
    const row: Record<string, number | string> = { name: monthShort(ym) };
    for (const s of series) row[s.key] = 0;
    for (const t of txns) {
      if (monthKeyOf(t.date) !== ym || !isSpend(t)) continue;
      const k = topIds.has(t.categoryId!) ? t.categoryId! : hasOther ? "__other" : null;
      if (k) (row[k] as number) += Math.abs(t.amountCents) / 100;
    }
    return row;
  });
  return { series, data };
}

const TOP_MERCHANTS = 10;
export function topMerchants(txns: Transaction[], months: string[]) {
  const win = new Set(months);
  const by = new Map<string, number>();
  for (const t of txns) {
    if (!win.has(monthKeyOf(t.date)) || !isSpend(t)) continue;
    const p = (t.payee || "").trim() || "(no payee)";
    by.set(p, (by.get(p) || 0) + Math.abs(t.amountCents));
  }
  return [...by.entries()].map(([name, v]) => ({ name, value: v / 100 })).sort((a, b) => b.value - a.value).slice(0, TOP_MERCHANTS);
}

export type BudgetVsActualRow = { id: string; name: string; Assigned: number; Spent: number };
export function budgetVsActual(txns: Transaction[], cats: Category[], budgetEntries: BudgetEntry[], months: string[]): BudgetVsActualRow[] {
  const win = new Set(months);
  const spent = new Map<string, number>();
  const assigned = new Map<string, number>();
  for (const t of txns) {
    if (win.has(monthKeyOf(t.date)) && isSpend(t)) spent.set(t.categoryId!, (spent.get(t.categoryId!) || 0) + Math.abs(t.amountCents));
  }
  for (const e of budgetEntries) {
    if (win.has(e.yearMonth)) assigned.set(e.categoryId, (assigned.get(e.categoryId) || 0) + e.amountCents);
  }
  const ids = new Set([...spent.keys(), ...assigned.keys()]);
  return [...ids]
    .map((id) => {
      const cat = cats.find((c) => c.id === id);
      return { id, name: cat?.name || "?", linked: !!cat?.linkedAccountId, Assigned: (assigned.get(id) || 0) / 100, Spent: (spent.get(id) || 0) / 100 };
    })
    .filter((r) => !r.linked) // payment categories are auto-derived — not meaningful here
    .map(({ id, name, Assigned, Spent }) => ({ id, name, Assigned, Spent }))
    .sort((a, b) => b.Assigned + b.Spent - (a.Assigned + a.Spent));
}
