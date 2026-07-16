-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "linkedAccountId" TEXT;

-- AlterTable
ALTER TABLE "category_groups" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "categories_linkedAccountId_key" ON "categories"("linkedAccountId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: ensure the singleton hidden "Credit Card Payments" group exists. Guarded with
-- NOT EXISTS so this migration is safe to run against a DB that already has one.
INSERT INTO "category_groups" ("id", "name", "isHidden", "createdAt")
SELECT 'grp_cc_payments', 'Credit Card Payments', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "category_groups" WHERE "isHidden" = true);

-- Backfill: create one linked payment category per pre-existing on-budget CREDIT account
-- that doesn't already have one (matches the spec: "every on-budget credit-card account").
INSERT INTO "categories" ("id", "groupId", "name", "linkedAccountId", "createdAt", "updatedAt")
SELECT 'catpay_' || a."id",
       (SELECT "id" FROM "category_groups" WHERE "isHidden" = true LIMIT 1),
       a."name" || ' Payment',
       a."id",
       now(),
       now()
FROM "accounts" a
WHERE a."type" = 'CREDIT'
  AND a."onBudget" = true
  AND NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."linkedAccountId" = a."id");
