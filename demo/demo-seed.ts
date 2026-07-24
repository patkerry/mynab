import { PrismaClient as SqliteClient } from "../src/generated/prisma-sqlite/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type { PrismaClient as PgClient } from "../src/generated/prisma-postgres/client";

// Seeds the FRESH-START state the demo video opens on: the starter category set a brand-new user
// gets (mirrors DEFAULT_CATEGORY_GROUPS in src/lib/user-provisioning.ts, which is `server-only`
// and can't be imported here) — no accounts, no transactions, Ready to Assign $0.00. The demo
// then builds the budget on camera. Runs against the e2e SQLite DB.
const BUDGET_ID = "default-budget";
const GROUPS: { name: string; categories: string[] }[] = [
  { name: "Immediate Obligations", categories: ["Rent/Mortgage", "Electric", "Water", "Internet", "Phone", "Groceries", "Transportation"] },
  { name: "True Expenses", categories: ["Auto Maintenance", "Home Maintenance", "Medical", "Insurance", "Subscriptions"] },
  { name: "Quality of Life", categories: ["Dining Out", "Entertainment", "Fun Money", "Vacation"] },
];

async function main() {
  const prisma = new SqliteClient({ adapter: new PrismaBetterSqlite3({ url: "file:./prisma/e2e.db" }) }) as unknown as PgClient;
  try {
    await prisma.budget.upsert({ where: { id: BUDGET_ID }, update: {}, create: { id: BUDGET_ID, name: "My Budget" } });
    await prisma.$transaction([
      prisma.transactionSplit.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.transaction.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.budgetEntry.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.reconciliation.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.category.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.categoryGroup.deleteMany({ where: { budgetId: BUDGET_ID } }),
      prisma.account.deleteMany({ where: { budgetId: BUDGET_ID } }),
    ]);
    for (const g of GROUPS) {
      const group = await prisma.categoryGroup.create({ data: { budgetId: BUDGET_ID, name: g.name } });
      for (const name of g.categories) {
        await prisma.category.create({ data: { budgetId: BUDGET_ID, groupId: group.id, name } });
      }
    }
    console.log("[demo] fresh-start state seeded");
  } finally {
    await prisma.$disconnect();
  }
}
main();
