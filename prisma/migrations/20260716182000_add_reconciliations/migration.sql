-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "statementBalanceCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL,
    "adjustmentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_adjustmentTransactionId_key" ON "reconciliations"("adjustmentTransactionId");

-- CreateIndex
CREATE INDEX "reconciliations_accountId_date_idx" ON "reconciliations"("accountId", "date");

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_adjustmentTransactionId_fkey" FOREIGN KEY ("adjustmentTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
