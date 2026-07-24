-- Split transactions: one register row allocated across multiple category lines (or a
-- Ready-to-Assign line for the income part of a deposit). Lines must sum to the parent
-- transaction's amountCents — enforced in the app (validateSplitDraft), not the DB.
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transaction_splits_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transaction_splits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "transaction_splits_budgetId_idx" ON "transaction_splits"("budgetId");
CREATE INDEX "transaction_splits_transactionId_idx" ON "transaction_splits"("transactionId");
CREATE INDEX "transaction_splits_categoryId_idx" ON "transaction_splits"("categoryId");
