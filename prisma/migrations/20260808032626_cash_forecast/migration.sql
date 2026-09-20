-- CreateEnum
CREATE TYPE "CashFlowKind" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "CashCadence" AS ENUM ('ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "CashPosition" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'firm',
    "openingCents" INTEGER NOT NULL DEFAULT 0,
    "openingAsOf" DATE NOT NULL,
    "minCashCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowLine" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CashFlowKind" NOT NULL,
    "category" TEXT,
    "amountCents" INTEGER NOT NULL,
    "cadence" "CashCadence" NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlowLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashPosition_scope_key" ON "CashPosition"("scope");

-- CreateIndex
CREATE INDEX "CashFlowLine_active_idx" ON "CashFlowLine"("active");

