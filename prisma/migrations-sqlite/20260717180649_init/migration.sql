-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "onBudget" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "category_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goalType" TEXT,
    "goalAmountCents" INTEGER,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "linkedAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "category_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "categories_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budget_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Mirrors the "category_null_unless_normal" CHECK constraint hand-added in the postgres
    -- migration history (20260716175203_add_category_check_constraint). SQLite has no
    -- ALTER TABLE ADD CONSTRAINT, so this is folded straight into the initial CREATE TABLE
    -- instead — this migration is the SQLite history's baseline, so there's no prior state to
    -- migrate away from.
    CONSTRAINT "category_null_unless_normal" CHECK ("kind" = 'NORMAL' OR "categoryId" IS NULL)
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "statementBalanceCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL,
    "adjustmentTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reconciliations_adjustmentTransactionId_fkey" FOREIGN KEY ("adjustmentTransactionId") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_linkedAccountId_key" ON "categories"("linkedAccountId");

-- CreateIndex
CREATE INDEX "categories_groupId_idx" ON "categories"("groupId");

-- CreateIndex
CREATE INDEX "budget_entries_yearMonth_idx" ON "budget_entries"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "budget_entries_categoryId_yearMonth_key" ON "budget_entries"("categoryId", "yearMonth");

-- CreateIndex
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "transactions_categoryId_date_idx" ON "transactions"("categoryId", "date");

-- CreateIndex
CREATE INDEX "transactions_kind_idx" ON "transactions"("kind");

-- CreateIndex
CREATE INDEX "transactions_transferId_idx" ON "transactions"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_accountId_externalId_key" ON "transactions"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_adjustmentTransactionId_key" ON "reconciliations"("adjustmentTransactionId");

-- CreateIndex
CREATE INDEX "reconciliations_accountId_date_idx" ON "reconciliations"("accountId", "date");
