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
  const { transactions, categories, budgetEntries, accounts } = await getReportsData();

  // Off-budget (Investment/Loan) accounts belong in net worth but not in spending/income — feed the
  // budget-facing reports only on-budget transactions; net worth sees everything.
  const offBudget = new Set(accounts.filter((a) => !a.onBudget).map((a) => a.id));
  const onBudgetTxns = transactions.filter((t) => !offBudget.has(t.accountId));

  return (
    <ReportsView
      range={range}
      summary={summary(onBudgetTxns, months)}
      spendByCat={spendByCategory(onBudgetTxns, categories, months)}
      incomeExpense={incomeVsSpending(onBudgetTxns, months)}
      netWorth={netWorthTrend(transactions, months)}
      catTrend={categorySpendTrend(onBudgetTxns, categories, months)}
      merchants={topMerchants(onBudgetTxns, months)}
      budgetVsActual={budgetVsActual(onBudgetTxns, categories, budgetEntries, months)}
    />
  );
}
