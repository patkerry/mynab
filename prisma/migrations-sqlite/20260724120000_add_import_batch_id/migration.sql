-- Group rows created by one file import so the whole batch can be undone (see undoImport).
ALTER TABLE "transactions" ADD COLUMN "importBatchId" TEXT;
CREATE INDEX "transactions_importBatchId_idx" ON "transactions"("importBatchId");
