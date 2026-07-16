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

export async function setGoal(categoryId: string, goalType: GoalType, amountCents: number) {
  await prisma.category.update({ where: { id: categoryId }, data: { goalType, goalAmountCents: amountCents } });
  revalidateAll();
}

export async function removeGoal(categoryId: string) {
  await prisma.category.update({ where: { id: categoryId }, data: { goalType: null, goalAmountCents: null } });
  revalidateAll();
}
