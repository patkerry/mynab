-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "counterpartAccountId" TEXT;

-- Backfill: for every existing TRANSFER leg, point it at its sibling's accountId (the two legs
-- share a transferId). New transfers set this directly at creation time (see addTransaction in
-- src/app/accounts/actions.ts) — this backfill only covers pre-existing historical rows.
UPDATE "transactions" AS t1
SET "counterpartAccountId" = t2."accountId"
FROM "transactions" AS t2
WHERE t1."transferId" IS NOT NULL
  AND t2."transferId" = t1."transferId"
  AND t2."id" != t1."id"
  AND t1."deletedAt" IS NULL
  AND t2."deletedAt" IS NULL;
