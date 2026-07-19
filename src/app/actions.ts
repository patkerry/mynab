"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireBudget } from "@/lib/budget-context";
import { resetDatabase } from "../../prisma/seedData";

// Ports ResetModal's reset (ynab-clone.jsx lines 987-996). Scoped to the active budget: only that
// budget's data is wiped and reseeded with demo data (requires manage rights — this is destructive).
export async function resetDemoData() {
  const { budgetId } = await requireBudget("manage");
  await resetDatabase(prisma, budgetId);
  revalidatePath("/", "layout");
}
