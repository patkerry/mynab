import "server-only";

// Web (Postgres) active-budget resolver. Split from budget-context.ts so the desktop build never
// imports Auth.js. Resolves: Auth.js session -> app User id -> the user's selected budget (from the
// `activeBudgetId` cookie, VALIDATED against their Membership rows) -> falls back to their first
// budget. Throws if unauthenticated or the user has no budget (proxy should have redirected first).
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "./db";
import type { ActiveBudget } from "./budget-context";

export const ACTIVE_BUDGET_COOKIE = "activeBudgetId";

export async function resolveWebActiveBudget(): Promise<ActiveBudget> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthenticated");

  // Enforce suspension in the data layer so it takes effect immediately, even for a user who still
  // holds a valid session JWT (the signIn block only stops new logins). No data access while suspended.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
  if (!user || user.suspendedAt) throw new Error("Account suspended");

  const selected = (await cookies()).get(ACTIVE_BUDGET_COOKIE)?.value;

  // Only honor the cookie if the user actually has a membership for it — otherwise a tampered
  // cookie could point at someone else's budget.
  const membership =
    (selected
      ? await prisma.membership.findFirst({ where: { userId, budgetId: selected } })
      : null) ?? (await prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }));

  if (!membership) throw new Error("User has no budget");
  return { budgetId: membership.budgetId, role: membership.role };
}
