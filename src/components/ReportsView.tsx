"use client";

import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";

const barColors = ["#4A45C4", "#1C9C64", "#B9821B", "#CB4E33", "#3E8E8A", "#7A57C9", "#C25E9B"];
const money = (v: number) => "$" + Math.round(v).toLocaleString();

export function ReportsView({
  monthLabel,
  spendByCat,
  incomeExpense,
  netWorthTrend,
}: {
  monthLabel: string;
  spendByCat: { name: string; value: number }[];
  incomeExpense: { name: string; Income: number; Spending: number }[];
  netWorthTrend: { name: string; value: number }[];
}) {
  return (
    <div style={{ padding: "18px 26px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="eyebrow">Reports</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "2px 0 0" }}>{monthLabel} & trends</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Spending by category</div>
          {spendByCat.length === 0 ? (
            <Empty msg="No spending this month." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, spendByCat.length * 42)}>
              <BarChart data={spendByCat} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} />
                <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--paper)" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {spendByCat.map((_, i) => (
                    <Cell key={i} fill={barColors[i % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Income vs. spending</div>
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
        </div>

        <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <TrendingUp size={16} color="var(--accent)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Net worth trend</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={netWorthTrend} margin={{ left: 4, right: 12 }}>
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

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: "36px 0", textAlign: "center", color: "var(--ink3)", fontSize: 13 }}>{msg}</div>;
}
