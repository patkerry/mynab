"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireBudget } from "@/lib/budget-context";
import { computeAutoAssignAllocations, computeQuickBudgetAllocations } from "@/lib/budget";
import type { GoalType } from "@/generated/prisma-postgres/client";

function revalidateAll() {
  revalidatePath("/", "layout");
}

// Ports setAssigned (ynab-clone.jsx lines 258-263).
export async function setAssigned(categoryId: string, month: string, cents: number) {
  const { budgetId } = await requireBudget("write");
  // Verify the category belongs to the active budget before touching its entries — categoryId
  // comes from the client, so this stops a caller assigning into another budget's category.
  const cat = await prisma.category.findFirst({ where: { id: categoryId, budgetId }, select: { id: true } });
  if (!cat) return;
  if (cents === 0) {
    await prisma.budgetEntry.deleteMany({ where: { budgetId, categoryId, yearMonth: month } });
  } else {
    await prisma.budgetEntry.upsert({
      where: { categoryId_yearMonth: { categoryId, yearMonth: month } },
      update: { amountCents: cents },
      create: { budgetId, categoryId, yearMonth: month, amountCents: cents },
    });
  }
  revalidateAll();
}

// Ports autoAssignGoals (ynab-clone.jsx lines 265-286).
export async function autoAssignGoals(month: string) {
  const { budgetId } = await requireBudget("write");
  const [accounts, categories, transactions, budgetEntries] = await Promise.all([
    prisma.account.findMany({ where: { budgetId } }),
    prisma.category.findMany({ where: { budgetId } }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
  ]);
  const updates = computeAutoAssignAllocations({ accounts, categories, transactions, budgetEntries }, month);
  if (updates.length) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.budgetEntry.upsert({
          where: { categoryId_yearMonth: { categoryId: u.categoryId, yearMonth: month } },
          update: { amountCents: u.amountCents },
          create: { budgetId, categoryId: u.categoryId, yearMonth: month, amountCents: u.amountCents },
        })
      )
    );
  }
  revalidateAll();
}

// Bulk "carry the plan forward": fund every not-yet-budgeted category from its 3-month average.
// Mirrors autoAssignGoals' fetch/$transaction/upsert skeleton. Returns a summary for the toast;
// count 0 means there was no recent history to average (nothing written).
export async function quickBudget(month: string): Promise<{ count: number; totalCents: number }> {
  const { budgetId } = await requireBudget("write");
  const [accounts, categories, transactions, budgetEntries] = await Promise.all([
    prisma.account.findMany({ where: { budgetId } }),
    prisma.category.findMany({ where: { budgetId } }),
    prisma.transaction.findMany({ where: { budgetId, deletedAt: null } }),
    prisma.budgetEntry.findMany({ where: { budgetId } }),
  ]);
  const updates = computeQuickBudgetAllocations({ accounts, categories, transactions, budgetEntries }, month);
  if (updates.length) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.budgetEntry.upsert({
          where: { categoryId_yearMonth: { categoryId: u.categoryId, yearMonth: month } },
          update: { amountCents: u.amountCents },
          create: { budgetId, categoryId: u.categoryId, yearMonth: month, amountCents: u.amountCents },
        })
      )
    );
    revalidateAll();
  }
  // These categories were unassigned before, so each amountCents is entirely newly-budgeted money.
  return { count: updates.length, totalCents: updates.reduce((s, u) => s + u.amountCents, 0) };
}

export async function addGroup(name: string) {
  const { budgetId } = await requireBudget("write");
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.categoryGroup.create({ data: { budgetId, name: trimmed } });
  revalidateAll();
}

export async function addCategory(groupId: string, name: string) {
  const { budgetId } = await requireBudget("write");
  const trimmed = name.trim();
  if (!trimmed) return;
  // Ensure the group is in the active budget before attaching a category to it.
  const group = await prisma.categoryGroup.findFirst({ where: { id: groupId, budgetId }, select: { id: true } });
  if (!group) return;
  await prisma.category.create({ data: { budgetId, groupId, name: trimmed } });
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
  const { budgetId } = await requireBudget("write");
  const category = await prisma.category.findFirst({ where: { id: categoryId, budgetId }, select: { linkedAccountId: true } });
  if (!category) return { ok: false, reason: "Category not found." };
  if (goalType === "TARGET" && category.linkedAccountId != null) {
    return { ok: false, reason: "Payment categories can only use monthly funding goals, not a savings target." };
  }
  await prisma.category.updateMany({ where: { id: categoryId, budgetId }, data: { goalType, goalAmountCents: amountCents } });
  revalidateAll();
  return { ok: true };
}

export async function removeGoal(categoryId: string) {
  const { budgetId } = await requireBudget("write");
  await prisma.category.updateMany({ where: { id: categoryId, budgetId }, data: { goalType: null, goalAmountCents: null } });
  revalidateAll();
}

// Purely a display toggle — doesn't touch budgetEntries, transactions, or goals, so hiding a
// category (e.g. a one-off like "Concert" you don't need to see going forward) never affects
// available()/Ready-to-Assign/reports. BudgetView filters hidden categories out of the main
// list; they stay fully assignable/reportable, just not cluttering the everyday view.
export async function setCategoryHidden(categoryId: string, hidden: boolean) {
  const { budgetId } = await requireBudget("write");
  await prisma.category.updateMany({ where: { id: categoryId, budgetId }, data: { isHidden: hidden } });
  revalidateAll();
}

// "Hide a group" is just "hide every category in it" — reuses the exact same isHidden field and
// collapse UI a single category already has (see BudgetView's "N hidden categories" toggle), so
// no new schema or display logic is needed. Same display-only guarantee as setCategoryHidden.
export async function setGroupHidden(groupId: string, hidden: boolean) {
  const { budgetId } = await requireBudget("write");
  await prisma.category.updateMany({ where: { budgetId, groupId }, data: { isHidden: hidden } });
  revalidateAll();
}
