-- CreateTable
CREATE TABLE "PnlAdjustment" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "periodMonth" DATE,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PnlAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PnlAdjustment_portfolioId_idx" ON "PnlAdjustment"("portfolioId");

-- AddForeignKey
ALTER TABLE "PnlAdjustment" ADD CONSTRAINT "PnlAdjustment_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

