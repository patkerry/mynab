-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_budget_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budget_entries_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budget_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_budget_entries" ("amountCents", "budgetId", "categoryId", "createdAt", "id", "updatedAt", "yearMonth") SELECT "amountCents", "budgetId", "categoryId", "createdAt", "id", "updatedAt", "yearMonth" FROM "budget_entries";
DROP TABLE "budget_entries";
ALTER TABLE "new_budget_entries" RENAME TO "budget_entries";
CREATE INDEX "budget_entries_budgetId_idx" ON "budget_entries"("budgetId");
CREATE INDEX "budget_entries_yearMonth_idx" ON "budget_entries"("yearMonth");
CREATE UNIQUE INDEX "budget_entries_categoryId_yearMonth_key" ON "budget_entries"("categoryId", "yearMonth");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
