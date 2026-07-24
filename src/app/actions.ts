"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireBudget } from "@/lib/budget-context";
import { resetDatabase } from "../../prisma/seedData";

// Ports ResetModal's reset (ynab-clone.jsx lines 987-996). Scoped to the active budget: only that
// budget's data is wiped and reseeded with demo data (requires manage rights — this is destructive).
export async function resetDemoData() {
  // The env flag previously only hid the sidebar button — a UI-only gate. Enforce it here too so
  // the action can't be invoked directly on an instance where demo resets are meant to be off.
  if (process.env.ENABLE_DEMO_RESET !== "true") return;
  const { budgetId } = await requireBudget("manage");
  await resetDatabase(prisma, budgetId);
  revalidatePath("/", "layout");
}
