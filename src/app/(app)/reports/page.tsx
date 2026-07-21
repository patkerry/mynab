import { getReportsData } from "@/lib/queries";
import { curYM } from "@/lib/format";
import { ReportsView } from "@/components/ReportsView";
import {
  RANGES,
  monthsForRange,
  summary,
  spendByCategory,
  incomeVsSpending,
  netWorthTrend,
  categorySpendTrend,
  topMerchants,
  budgetVsActual,
  type ReportRange,
} from "@/lib/reports";

// Forced dynamic: reads the ?range= search param and current-month data, so it must render per request
// rather than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range: ReportRange = (RANGES.some((r) => r.key === rangeParam) ? rangeParam : "6m") as ReportRange;
  const months = monthsForRange(range, curYM());
  const { transactions, categories, budgetEntries } = await getReportsData();

  return (
    <ReportsView
      range={range}
      summary={summary(transactions, months)}
      spendByCat={spendByCategory(transactions, categories, months)}
      incomeExpense={incomeVsSpending(transactions, months)}
      netWorth={netWorthTrend(transactions, months)}
      catTrend={categorySpendTrend(transactions, categories, months)}
      merchants={topMerchants(transactions, months)}
      budgetVsActual={budgetVsActual(transactions, categories, budgetEntries, months)}
    />
  );
}
