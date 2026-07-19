/*
  Warnings:

  - Added the required column `budgetId` to the `accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budgetId` to the `budget_entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budgetId` to the `categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budgetId` to the `category_groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budgetId` to the `reconciliations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budgetId` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "invites_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: all pre-existing (single-user) data belongs to one default budget. This lets the
-- required budgetId columns below be populated for existing rows (desktop upgrade / any DB that
-- had data before multi-user). A fresh database simply has this one budget and no rows to backfill.
INSERT INTO "budgets" ("id", "name", "createdAt", "updatedAt") VALUES ('default-budget', 'My Budget', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "onBudget" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("budgetId", "createdAt", "id", "name", "onBudget", "type", "updatedAt") SELECT 'default-budget', "createdAt", "id", "name", "onBudget", "type", "updatedAt" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_budgetId_idx" ON "accounts"("budgetId");
CREATE TABLE "new_budget_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budget_entries_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budget_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_budget_entries" ("budgetId", "amountCents", "categoryId", "createdAt", "id", "updatedAt", "yearMonth") SELECT 'default-budget', "amountCents", "categoryId", "createdAt", "id", "updatedAt", "yearMonth" FROM "budget_entries";
DROP TABLE "budget_entries";
ALTER TABLE "new_budget_entries" RENAME TO "budget_entries";
CREATE INDEX "budget_entries_budgetId_idx" ON "budget_entries"("budgetId");
CREATE INDEX "budget_entries_yearMonth_idx" ON "budget_entries"("yearMonth");
CREATE UNIQUE INDEX "budget_entries_categoryId_yearMonth_key" ON "budget_entries"("categoryId", "yearMonth");
CREATE TABLE "new_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goalType" TEXT,
    "goalAmountCents" INTEGER,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "linkedAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "categories_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "category_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "categories_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_categories" ("budgetId", "createdAt", "goalAmountCents", "goalType", "groupId", "id", "isHidden", "linkedAccountId", "name", "updatedAt") SELECT 'default-budget', "createdAt", "goalAmountCents", "goalType", "groupId", "id", "isHidden", "linkedAccountId", "name", "updatedAt" FROM "categories";
DROP TABLE "categories";
ALTER TABLE "new_categories" RENAME TO "categories";
CREATE UNIQUE INDEX "categories_linkedAccountId_key" ON "categories"("linkedAccountId");
CREATE INDEX "categories_budgetId_idx" ON "categories"("budgetId");
CREATE INDEX "categories_groupId_idx" ON "categories"("groupId");
CREATE TABLE "new_category_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_groups_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_category_groups" ("budgetId", "createdAt", "id", "isHidden", "name") SELECT 'default-budget', "createdAt", "id", "isHidden", "name" FROM "category_groups";
DROP TABLE "category_groups";
ALTER TABLE "new_category_groups" RENAME TO "category_groups";
CREATE INDEX "category_groups_budgetId_idx" ON "category_groups"("budgetId");
CREATE TABLE "new_reconciliations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "statementBalanceCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL,
    "adjustmentTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliations_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reconciliations_adjustmentTransactionId_fkey" FOREIGN KEY ("adjustmentTransactionId") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_reconciliations" ("budgetId", "accountId", "adjustmentCents", "adjustmentTransactionId", "createdAt", "date", "id", "statementBalanceCents") SELECT 'default-budget', "accountId", "adjustmentCents", "adjustmentTransactionId", "createdAt", "date", "id", "statementBalanceCents" FROM "reconciliations";
DROP TABLE "reconciliations";
ALTER TABLE "new_reconciliations" RENAME TO "reconciliations";
CREATE UNIQUE INDEX "reconciliations_adjustmentTransactionId_key" ON "reconciliations"("adjustmentTransactionId");
CREATE INDEX "reconciliations_budgetId_idx" ON "reconciliations"("budgetId");
CREATE INDEX "reconciliations_accountId_date_idx" ON "reconciliations"("accountId", "date");
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'NORMAL',
    "categoryId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "transferId" TEXT,
    "counterpartAccountId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("budgetId", "accountId", "amountCents", "categoryId", "cleared", "counterpartAccountId", "createdAt", "date", "deletedAt", "externalId", "id", "kind", "memo", "payee", "pending", "transferId", "updatedAt") SELECT 'default-budget', "accountId", "amountCents", "categoryId", "cleared", "counterpartAccountId", "createdAt", "date", "deletedAt", "externalId", "id", "kind", "memo", "payee", "pending", "transferId", "updatedAt" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE INDEX "transactions_budgetId_idx" ON "transactions"("budgetId");
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");
CREATE INDEX "transactions_categoryId_date_idx" ON "transactions"("categoryId", "date");
CREATE INDEX "transactions_kind_idx" ON "transactions"("kind");
CREATE INDEX "transactions_transferId_idx" ON "transactions"("transferId");
CREATE UNIQUE INDEX "transactions_accountId_externalId_key" ON "transactions"("accountId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
