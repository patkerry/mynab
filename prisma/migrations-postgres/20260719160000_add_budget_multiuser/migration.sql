-- Multi-user: introduce Budget as the ownership boundary, plus web-auth models (User/Membership/
-- Invite). Written to be safe whether the target Postgres is fresh (normal deploy) or already has
-- data: budgetId is added with a temporary default that backfills existing rows to one 'default-budget',
-- then the default is dropped so Prisma-issued inserts must supply budgetId explicitly (matches schema).

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable (budgets first so the backfill + FKs below have a row/target to reference)
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- Backfill target: any pre-existing (single-user) data is assigned to this one budget.
INSERT INTO "budgets" ("id", "name", "createdAt", "updatedAt") VALUES ('default-budget', 'My Budget', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add budgetId, backfilling existing rows via a temporary default, then drop the default.
ALTER TABLE "accounts" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "accounts" ALTER COLUMN "budgetId" DROP DEFAULT;
ALTER TABLE "category_groups" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "category_groups" ALTER COLUMN "budgetId" DROP DEFAULT;
ALTER TABLE "categories" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "categories" ALTER COLUMN "budgetId" DROP DEFAULT;
ALTER TABLE "budget_entries" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "budget_entries" ALTER COLUMN "budgetId" DROP DEFAULT;
ALTER TABLE "transactions" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "transactions" ALTER COLUMN "budgetId" DROP DEFAULT;
ALTER TABLE "reconciliations" ADD COLUMN "budgetId" TEXT NOT NULL DEFAULT 'default-budget';
ALTER TABLE "reconciliations" ALTER COLUMN "budgetId" DROP DEFAULT;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'EDITOR',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_budgetId_idx" ON "memberships"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_budgetId_key" ON "memberships"("userId", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_budgetId_idx" ON "invites"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_budgetId_email_key" ON "invites"("budgetId", "email");

-- CreateIndex
CREATE INDEX "accounts_budgetId_idx" ON "accounts"("budgetId");

-- CreateIndex
CREATE INDEX "category_groups_budgetId_idx" ON "category_groups"("budgetId");

-- CreateIndex
CREATE INDEX "categories_budgetId_idx" ON "categories"("budgetId");

-- CreateIndex
CREATE INDEX "budget_entries_budgetId_idx" ON "budget_entries"("budgetId");

-- CreateIndex
CREATE INDEX "transactions_budgetId_idx" ON "transactions"("budgetId");

-- CreateIndex
CREATE INDEX "reconciliations_budgetId_idx" ON "reconciliations"("budgetId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
