import { PrismaClient as PgClient } from "../src/generated/prisma-postgres/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as SqliteClient } from "../src/generated/prisma-sqlite/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resetDatabase } from "../prisma/seedData";

// Wipes and reseeds every budget in the DB with the standard demo dataset (the same reset the
// in-app "Reset demo data" button runs, per-budget). Reads DB_PROVIDER/DATABASE_URL from env:
//
//   npx tsx --env-file=.env scripts/reset-demo.ts
function makeClient() {
  const url = process.env.DATABASE_URL as string;
  if (process.env.DB_PROVIDER === "sqlite") {
    return new SqliteClient({ adapter: new PrismaBetterSqlite3({ url }) }) as unknown as PgClient;
  }
  return new PgClient({ adapter: new PrismaPg({ connectionString: url }) });
}

async function main() {
  const prisma = makeClient();
  try {
    const budgets = await prisma.budget.findMany({ select: { id: true, name: true } });
    if (budgets.length === 0) {
      console.log("No budgets found — nothing to reset.");
      return;
    }
    for (const b of budgets) {
      await resetDatabase(prisma, b.id);
      console.log(`Reset demo data for budget "${b.name}" (${b.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
