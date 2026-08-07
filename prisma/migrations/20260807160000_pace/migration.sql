-- CreateEnum
CREATE TYPE "LedgerProvider" AS ENUM ('QBO', 'ZOHO', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatementKind" AS ENUM ('IS', 'BS');

-- CreateEnum
CREATE TYPE "NaturalSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('OK', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'operating',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerConnection" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" "LedgerProvider" NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "realmId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "statement" "StatementKind" NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "naturalSide" "NaturalSide" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "sourceType" TEXT,
    "mappedReportingAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialBalancePeriod" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "periodMonth" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "balanced" BOOLEAN NOT NULL DEFAULT false,
    "sourcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "TrialBalancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialBalanceLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "TrialBalanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'OK',
    "message" TEXT,
    "stats" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entity_active_idx" ON "Entity"("active");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerConnection_entityId_key" ON "LedgerConnection"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingAccount_code_key" ON "ReportingAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerAccount_entityId_idx" ON "LedgerAccount"("entityId");

-- CreateIndex
CREATE INDEX "LedgerAccount_mappedReportingAccountId_idx" ON "LedgerAccount"("mappedReportingAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_entityId_externalId_key" ON "LedgerAccount"("entityId", "externalId");

-- CreateIndex
CREATE INDEX "TrialBalancePeriod_entityId_idx" ON "TrialBalancePeriod"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialBalancePeriod_entityId_periodMonth_key" ON "TrialBalancePeriod"("entityId", "periodMonth");

-- CreateIndex
CREATE INDEX "TrialBalanceLine_periodId_idx" ON "TrialBalanceLine"("periodId");

-- CreateIndex
CREATE INDEX "TrialBalanceLine_ledgerAccountId_idx" ON "TrialBalanceLine"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "SyncRun_entityId_idx" ON "SyncRun"("entityId");

-- AddForeignKey
ALTER TABLE "LedgerConnection" ADD CONSTRAINT "LedgerConnection_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_mappedReportingAccountId_fkey" FOREIGN KEY ("mappedReportingAccountId") REFERENCES "ReportingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBalancePeriod" ADD CONSTRAINT "TrialBalancePeriod_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBalanceLine" ADD CONSTRAINT "TrialBalanceLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TrialBalancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBalanceLine" ADD CONSTRAINT "TrialBalanceLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

