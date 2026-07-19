"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// Suspend a user: blocks new logins (signIn callback) and all data access (getActiveBudget web path)
// until reactivated. Admins can't suspend themselves (avoids self-lockout).
export async function suspendUser(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("You can't suspend your own account.");
  await prisma.user.update({ where: { id: userId }, data: { suspendedAt: new Date() } });
  revalidatePath("/admin");
}

export async function reactivateUser(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { suspendedAt: null } });
  revalidatePath("/admin");
}

// Permanently delete a user and every budget they solely own (cascade removes that budget's accounts,
// categories, transactions, memberships, etc.). Budgets they share with others are left intact — only
// their membership in those is removed (via the user delete cascade). Admins can't delete themselves.
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("You can't delete your own account.");

  await prisma.$transaction(async (tx) => {
    // Budgets this user owns...
    const owned = await tx.membership.findMany({ where: { userId, role: "OWNER" }, select: { budgetId: true } });
    const ownedBudgetIds = owned.map((m) => m.budgetId);
    if (ownedBudgetIds.length) {
      // ...that have no OTHER members — safe to delete entirely.
      const shared = await tx.membership.findMany({
        where: { budgetId: { in: ownedBudgetIds }, userId: { not: userId } },
        select: { budgetId: true },
      });
      const sharedIds = new Set(shared.map((m) => m.budgetId));
      const soleOwned = ownedBudgetIds.filter((id) => !sharedIds.has(id));
      if (soleOwned.length) await tx.budget.deleteMany({ where: { id: { in: soleOwned } } });
    }
    // Removes the user and, by cascade, all their remaining memberships.
    await tx.user.delete({ where: { id: userId } });
  });

  revalidatePath("/admin");
}
