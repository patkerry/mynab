import { getReportsData } from "@/lib/queries";
import { curYM, monthKeyOf, addMonths, monthShort, monthLabel } from "@/lib/format";
import { ReportsView } from "@/components/ReportsView";

// Forced dynamic: this page has no searchParams/cookies usage, so Next.js would otherwise
// statically prerender it at build time — freezing curYM() (and all DB data) as of build time.
export const dynamic = "force-dynamic";

// Ports the chart-data useMemos from the original ReportsView (ynab-clone.jsx lines 765-794).
// This app has no cross-route month picker (unlike /budget), so reports always anchor on the
// real current month rather than a shared client-side `month` state.
export default async function ReportsPage() {
  const month = curYM();
  const { transactions, categories } = await getReportsData();

  const spendMap: Record<string, number> = {};
  transactions
    .filter((t) => monthKeyOf(t.date) === month && t.amountCents < 0 && t.categoryId !== null)
    .forEach((t) => {
      const id = t.categoryId as string;
      spendMap[id] = (spendMap[id] || 0) + Math.abs(t.amountCents);
    });
  const spendByCat = Object.entries(spendMap)
    .map(([id, v]) => ({ name: categories.find((c) => c.id === id)?.name || "?", value: v / 100 }))
    .sort((a, b) => b.value - a.value);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(month, -i));

  const incomeExpense = months.map((ym) => {
    let inc = 0;
    let exp = 0;
    transactions
      .filter((t) => monthKeyOf(t.date) === ym)
      .forEach((t) => {
        if (t.kind === "INCOME" || (t.amountCents > 0 && t.kind === "NORMAL" && t.categoryId !== null)) inc += t.amountCents;
        else if (t.amountCents < 0 && t.kind === "NORMAL" && t.categoryId !== null) exp += Math.abs(t.amountCents);
      });
    return { name: monthShort(ym), Income: inc / 100, Spending: exp / 100 };
  });

  const netWorthTrend = months.map((ym) => {
    const end = ym + "-31";
    const nw = transactions.filter((t) => t.date <= end).reduce((s, t) => s + t.amountCents, 0);
    return { name: monthShort(ym), value: nw / 100 };
  });

  return (
    <ReportsView monthLabel={monthLabel(month)} spendByCat={spendByCat} incomeExpense={incomeExpense} netWorthTrend={netWorthTrend} />
  );
}
