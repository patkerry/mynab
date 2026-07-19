import { PrismaClient } from "../src/generated/prisma-sqlite/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type { PrismaClient as PrismaClientPostgres } from "../src/generated/prisma-postgres/client";
import { resetDatabase } from "./seedData";

// SQLite counterpart to prisma/seed.ts (which is Postgres-only). Wipes and re-seeds the demo
// dataset against the DB pointed at by DATABASE_URL — used to reset the Electron desktop DB.
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

async function main() {
  await resetDatabase(prisma as unknown as PrismaClientPostgres, "default-budget");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
