import { PrismaClient as SqliteClient } from "../src/generated/prisma-sqlite/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type { PrismaClient as PgClient } from "../src/generated/prisma-postgres/client";
import { resetDatabase } from "../prisma/seedData";

// Test-side handle on the SAME SQLite file the e2e dev server uses. SQLite tolerates a second
// connection fine as long as writes don't overlap a server request — resets happen in
// beforeEach, while the browser is idle.
//
// "default-budget" is LOCAL_BUDGET_ID from src/lib/budget-context.ts (not imported here — that
// module is `server-only`); the desktop/sqlite provider resolves every request to this fixed id.
export const E2E_BUDGET_ID = "default-budget";
export const E2E_DB_URL = "file:./prisma/e2e.db";

export function makeDb(): PgClient {
  // Same cast src/lib/db.ts performs — sound while the schema-parity check holds.
  return new SqliteClient({ adapter: new PrismaBetterSqlite3({ url: E2E_DB_URL }) }) as unknown as PgClient;
}

// Wipe + reseed the one budget with the standard demo dataset (the exact data reset-demo.ts and
// the in-app reset produce), so every spec starts from a known ledger:
//   Checking 3927.00 = 3200 start + 2300 payroll − 1200 rent − 85 TJ − 62 Safeway − 73 power
//                      − 55 Shell − 98 Costco(split) ... Savings 5000.00, Visa −494.00 (?)
//   — don't hand-derive numbers in specs; read them off the seeded UI once and assert deltas.
export async function resetDb() {
  const db = makeDb();
  try {
    await resetDatabase(db, E2E_BUDGET_ID);
  } finally {
    await db.$disconnect();
  }
}
