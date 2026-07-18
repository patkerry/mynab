import { PrismaClient as PrismaClientPostgres } from "@/generated/prisma-postgres/client";
import { PrismaClient as PrismaClientSqlite } from "@/generated/prisma-sqlite/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// "postgres" (default) = server deployment; "sqlite" = embedded/Electron desktop build.
// See prisma.config.ts and prisma/schema.sqlite.prisma for the rest of this split.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientPostgres };

function createPrisma() {
  if (process.env.DB_PROVIDER === "sqlite") {
    const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL as string });
    return new PrismaClientSqlite({ adapter }) as unknown as PrismaClientPostgres;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClientPostgres({ adapter });
}

export const prisma: PrismaClientPostgres = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
