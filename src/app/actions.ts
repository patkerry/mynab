"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../../prisma/seedData";

// Ports ResetModal's reset (ynab-clone.jsx lines 987-996).
export async function resetDemoData() {
  await resetDatabase(prisma);
  revalidatePath("/", "layout");
}
