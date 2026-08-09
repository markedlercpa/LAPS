-- CreateTable
CREATE TABLE "GeneralLedgerLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ledgerAccountId" TEXT,
    "periodMonth" DATE NOT NULL,
    "txnDate" DATE NOT NULL,
    "txnType" TEXT,
    "docNumber" TEXT,
    "name" TEXT,
    "memo" TEXT,
    "splitAccount" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "externalTxnId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'qbo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralLedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneralLedgerLine_entityId_periodMonth_idx" ON "GeneralLedgerLine"("entityId", "periodMonth");

-- CreateIndex
CREATE INDEX "GeneralLedgerLine_ledgerAccountId_idx" ON "GeneralLedgerLine"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "GeneralLedgerLine_entityId_txnDate_idx" ON "GeneralLedgerLine"("entityId", "txnDate");

-- AddForeignKey
ALTER TABLE "GeneralLedgerLine" ADD CONSTRAINT "GeneralLedgerLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralLedgerLine" ADD CONSTRAINT "GeneralLedgerLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

