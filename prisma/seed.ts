import { PrismaClient } from "../src/generated/prisma-postgres/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resetDatabase } from "./seedData";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await resetDatabase(prisma, "default-budget");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
