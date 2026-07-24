"use client";

import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";
import { fmt } from "@/lib/format";
import { catColor } from "@/lib/viz-palette";
import { RangePicker } from "./RangePicker";
import type { ReportRange, Summary, CatSlice, TrendSeries, BudgetVsActualRow } from "@/lib/reports";
import styles from "./ReportsView.module.css";

const money = (v: number) => "$" + Math.round(v).toLocaleString();

export function ReportsView({
  range,
  summary,
  spendByCat,
  incomeExpense,
  netWorth,
  catTrend,
  merchants,
  budgetVsActual,
}: {
  range: ReportRange;
  summary: Summary;
  spendByCat: CatSlice[];
  incomeExpense: { name: string; Income: number; Spending: number }[];
  netWorth: { name: string; value: number }[];
  catTrend: { series: TrendSeries[]; data: Record<string, number | string>[] };
  merchants: { name: string; value: number }[];
  budgetVsActual: BudgetVsActualRow[];
}) {
  const router = useRouter();
  // Drill-down: clicking a category mark opens the transactions register filtered to that category
  // (the same target CatRow's name link uses).
  const drill = (id?: string) => id && router.push(`/accounts?account=all&category=${id}`);

  const savingsPct = Math.round(summary.savingsRate * 100);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className="eyebrow">Reports</div>
          <h2 className={styles.h2}>Spending & trends</h2>
        </div>
        <RangePicker active={range} />
      </div>

      {/* KPI stat tiles */}
      <div className={styles.kpiGrid}>
        <Kpi label="Income" value={fmt(summary.incomeCents)} color="var(--posInk)" />
        <Kpi label="Spending" value={fmt(summary.spendingCents)} color="var(--negInk)" />
        <Kpi label="Net saved" value={fmt(summary.netCents)} color={summary.netCents < 0 ? "var(--negInk)" : "var(--posInk)"} />
        <Kpi label="Savings rate" value={`${savingsPct}%`} color={savingsPct < 0 ? "var(--negInk)" : "var(--ink)"} />
      </div>

      <div className={styles.chartGrid}>
        <Card title="Spending by category" subtitle="Click a bar to see its transactions">
          {spendByCat.length === 0 ? (
            <Empty msg="No spending in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, spendByCat.length * 40)}>
              <BarChart data={spendByCat} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--paper)" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} cursor="pointer" onClick={(d: { id?: string }) => drill(d?.id)}>
                  {spendByCat.map((_, i) => (
                    <Cell key={i} fill={catColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Category spend trend">
          {catTrend.series.length === 0 ? (
            <Empty msg="No spending in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={catTrend.data} margin={{ left: 4, right: 12 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} width={52} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {catTrend.series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={catColor(i)} strokeWidth={2} dot={{ r: 2.5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Budget vs. actual" subtitle="Assigned vs spent — click a bar for details">
          {budgetVsActual.length === 0 ? (
            <Empty msg="Nothing assigned or spent in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, budgetVsActual.length * 46)}>
              <BarChart data={budgetVsActual} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--paper)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Assigned" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={(d: { id?: string }) => drill(d?.id)} />
                <Bar dataKey="Spent" fill={catColor(5)} radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={(d: { id?: string }) => drill(d?.id)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Top merchants">
          {merchants.length === 0 ? (
            <Empty msg="No spending in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, merchants.length * 34)}>
              <BarChart data={merchants} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--paper)" }} />
                <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Income vs. spending">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpense} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink2)" }} />
              <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} width={52} />
              <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--paper)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="var(--pos)" radius={[5, 5, 0, 0]} barSize={16} />
              <Bar dataKey="Spending" fill="var(--neg)" radius={[5, 5, 0, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className={`card ${styles.wideCard}`}>
          <div className={styles.cardHeadRow}>
            <TrendingUp size={16} color="var(--accent)" />
            <div className={styles.cardTitle}>Net worth trend</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={netWorth} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink2)" }} />
              <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} width={60} />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`card ${styles.kpiCard}`}>
      <div className={`eyebrow ${styles.kpiLabel}`}>{label}</div>
      <div className={`num ${styles.kpiValue}`} style={{ color }}>{value}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className={`card ${styles.cardPad}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{title}</div>
        {subtitle && <div className={styles.cardSub}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className={styles.empty}>{msg}</div>;
}
