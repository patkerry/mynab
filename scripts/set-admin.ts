import { PrismaClient as PgClient } from "../src/generated/prisma-postgres/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as SqliteClient } from "../src/generated/prisma-sqlite/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Bootstrap (or revoke) a global admin. There is deliberately no in-app "make admin" flow, so this
// is how the first admin is granted. The user must have signed in at least once (so their User row
// exists). Reads DB_PROVIDER/DATABASE_URL from the environment.
//
//   npx tsx scripts/set-admin.ts you@example.com            # grant
//   npx tsx scripts/set-admin.ts you@example.com --revoke   # revoke
const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: tsx scripts/set-admin.ts <email> [--revoke]");
  process.exit(1);
}

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
    const user = await prisma.user.update({ where: { email }, data: { isAdmin: !revoke } });
    console.log(`${revoke ? "Revoked admin from" : "Granted admin to"} ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
