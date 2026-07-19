import { PrismaClient } from "../src/generated/prisma-postgres/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const users = await prisma.user.findMany({ select: { email: true, name: true, isAdmin: true, suspendedAt: true, _count: { select: { memberships: true } } } });
  const budgets = await prisma.budget.findMany({ select: { name: true, _count: { select: { categoryGroups: true, categories: true, accounts: true } } } });
  console.log("USER COUNT:", users.length);
  console.log("USERS:", JSON.stringify(users, null, 2));
  console.log("BUDGETS:", JSON.stringify(budgets, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
