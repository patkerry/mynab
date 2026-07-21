import { getCategoriesData } from "@/lib/queries";
import { CategoriesView } from "@/components/CategoriesView";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { groups, categories } = await getCategoriesData();
  return <CategoriesView groups={groups} categories={categories} />;
}
