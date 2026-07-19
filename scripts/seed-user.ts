import { PrismaClient } from "../src/generated/prisma-postgres/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resetDatabase } from "../prisma/seedData";

// Provision a user (by email) with an owned budget and fill it with the demo dataset — useful for
// testing multi-user with a second, populated account. Idempotent: reuses the user's existing OWNER
// budget if present (and re-seeds it). The email MUST match the Google account they'll sign in with,
// or the seeded budget won't be the one they see after login.
//
//   DB_PROVIDER=postgres DATABASE_URL=... npx tsx scripts/seed-user.ts someone@gmail.com
const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx scripts/seed-user.ts <email>");
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const name = email.split("@")[0];
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name } });

    // Reuse their OWNER budget if they already have one; otherwise create it.
    let membership = await prisma.membership.findFirst({ where: { userId: user.id, role: "OWNER" } });
    if (!membership) {
      const budget = await prisma.budget.create({ data: { name: `${name}'s Budget` } });
      membership = await prisma.membership.create({ data: { userId: user.id, budgetId: budget.id, role: "OWNER" } });
    }

    // Wipe + fill that budget with the demo dataset (accounts, categories, transactions, assignments).
    await resetDatabase(prisma, membership.budgetId);
    console.log(`Seeded demo data into budget ${membership.budgetId} for ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
