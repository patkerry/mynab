"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeAutoAssignAllocations } from "@/lib/budget";
import type { GoalType } from "@/generated/prisma/client";

function revalidateAll() {
  revalidatePath("/", "layout");
}

// Ports setAssigned (ynab-clone.jsx lines 258-263).
export async function setAssigned(categoryId: string, month: string, cents: number) {
  if (cents === 0) {
    await prisma.budgetEntry.deleteMany({ where: { categoryId, yearMonth: month } });
  } else {
    await prisma.budgetEntry.upsert({
      where: { categoryId_yearMonth: { categoryId, yearMonth: month } },
      update: { amountCents: cents },
      create: { categoryId, yearMonth: month, amountCents: cents },
    });
  }
  revalidateAll();
}

// Ports autoAssignGoals (ynab-clone.jsx lines 265-286).
export async function autoAssignGoals(month: string) {
  const [accounts, categories, transactions, budgetEntries] = await Promise.all([
    prisma.account.findMany(),
    prisma.category.findMany(),
    prisma.transaction.findMany(),
    prisma.budgetEntry.findMany(),
  ]);
  const updates = computeAutoAssignAllocations({ accounts, categories, transactions, budgetEntries }, month);
  if (updates.length) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.budgetEntry.upsert({
          where: { categoryId_yearMonth: { categoryId: u.categoryId, yearMonth: month } },
          update: { amountCents: u.amountCents },
          create: { categoryId: u.categoryId, yearMonth: month, amountCents: u.amountCents },
        })
      )
    );
  }
  revalidateAll();
}

export async function addGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.categoryGroup.create({ data: { name: trimmed } });
  revalidateAll();
}

export async function addCategory(groupId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.category.create({ data: { groupId, name: trimmed } });
  revalidateAll();
}

export type SetGoalResult = { ok: true } | { ok: false; reason: string };

// A TARGET goal's progress is `available / goalAmount` — for a payment category, available
// goes UP the more you spend on the card, so a savings target would show "progress" backwards
// (spend more, get closer to "done"). A MONTHLY goal is fine on a payment category ("always
// assign at least $X/month toward this card") since it only tracks what was actually assigned.
// The GoalModal already only offers MONTHLY for payment categories; this is the server-side
// backstop so it can't be bypassed by calling the action directly.
export async function setGoal(categoryId: string, goalType: GoalType, amountCents: number): Promise<SetGoalResult> {
  if (goalType === "TARGET") {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { linkedAccountId: true } });
    if (category?.linkedAccountId != null) {
      return { ok: false, reason: "Payment categories can only use monthly funding goals, not a savings target." };
    }
  }
  await prisma.category.update({ where: { id: categoryId }, data: { goalType, goalAmountCents: amountCents } });
  revalidateAll();
  return { ok: true };
}

export async function removeGoal(categoryId: string) {
  await prisma.category.update({ where: { id: categoryId }, data: { goalType: null, goalAmountCents: null } });
  revalidateAll();
}
