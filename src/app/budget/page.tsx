import { getBudgetPageData } from "@/lib/queries";
import { curYM } from "@/lib/format";
import { BudgetView } from "@/components/BudgetView";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = params.month || curYM();
  const { groups, categories, accounts, transactions, budgetEntries } = await getBudgetPageData();

  return (
    <BudgetView
      month={month}
      groups={groups}
      categories={categories}
      accounts={accounts}
      transactions={transactions}
      budgetEntries={budgetEntries}
    />
  );
}
