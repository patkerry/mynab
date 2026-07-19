import "server-only";
import { prisma } from "./db";

// Starter budget for a brand-new web user — mirrors electron/main.js's DEFAULT_CATEGORY_GROUPS so
// desktop and web first-run give the same usable YNAB-style set. The credit-card payment group is
// intentionally omitted; it's created on demand when a CREDIT account is added (see addAccount).
const DEFAULT_CATEGORY_GROUPS: { name: string; categories: string[] }[] = [
  { name: "Immediate Obligations", categories: ["Rent/Mortgage", "Electric", "Water", "Internet", "Phone", "Groceries", "Transportation"] },
  { name: "True Expenses", categories: ["Auto Maintenance", "Home Maintenance", "Medical", "Insurance", "Subscriptions"] },
  { name: "Quality of Life", categories: ["Dining Out", "Entertainment", "Fun Money", "Vacation"] },
];

// Idempotent by email: returns the existing user if they've signed in before, otherwise creates the
// User + their first Budget + an OWNER Membership + seeds default categories, all in one transaction.
// Called from the Auth.js jwt callback on sign-in.
export async function ensureUserAndBudget(input: { email: string; name: string | null; image: string | null }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: input.email, name: input.name, image: input.image } });
    const budget = await tx.budget.create({ data: { name: "My Budget" } });
    await tx.membership.create({ data: { userId: user.id, budgetId: budget.id, role: "OWNER" } });
    for (const group of DEFAULT_CATEGORY_GROUPS) {
      const created = await tx.categoryGroup.create({ data: { budgetId: budget.id, name: group.name } });
      for (const name of group.categories) {
        await tx.category.create({ data: { budgetId: budget.id, groupId: created.id, name } });
      }
    }
    return user;
  });
}
