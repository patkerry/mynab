import { getBudgetPageModel } from "@/lib/queries";
import { curYM } from "@/lib/format";
import { BudgetView } from "@/components/BudgetView";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = params.month || curYM();
  const { groups, categories, model } = await getBudgetPageModel(month);

  return <BudgetView month={month} groups={groups} categories={categories} model={model} />;
}
