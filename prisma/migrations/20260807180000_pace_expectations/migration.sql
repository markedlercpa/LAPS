-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('ORIGINAL', 'REFORECAST', 'SCENARIO');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL DEFAULT 'ORIGINAL',
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "reportingAccountId" TEXT NOT NULL,
    "monthly" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianceNote" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reportingAccountId" TEXT NOT NULL,
    "periodMonth" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VarianceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_entityId_idx" ON "Budget"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_entityId_fiscalYear_label_key" ON "Budget"("entityId", "fiscalYear", "label");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_reportingAccountId_key" ON "BudgetLine"("budgetId", "reportingAccountId");

-- CreateIndex
CREATE INDEX "VarianceNote_entityId_periodMonth_idx" ON "VarianceNote"("entityId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "VarianceNote_entityId_reportingAccountId_periodMonth_key" ON "VarianceNote"("entityId", "reportingAccountId", "periodMonth");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_reportingAccountId_fkey" FOREIGN KEY ("reportingAccountId") REFERENCES "ReportingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceNote" ADD CONSTRAINT "VarianceNote_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceNote" ADD CONSTRAINT "VarianceNote_reportingAccountId_fkey" FOREIGN KEY ("reportingAccountId") REFERENCES "ReportingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

