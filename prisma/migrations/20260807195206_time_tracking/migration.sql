-- DropIndex
DROP INDEX "PortfolioEngagement_karbonWorkItemKey_idx";

-- AlterTable
ALTER TABLE "PoolResource" DROP COLUMN "karbonUserId";

-- AlterTable
ALTER TABLE "PortfolioEngagement" DROP COLUMN "karbonWorkItemKey";

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "roleBandId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_engagementId_resourceId_isoWeek_idx" ON "TimeEntry"("engagementId", "resourceId", "isoWeek");

-- CreateIndex
CREATE INDEX "TimeEntry_resourceId_workDate_idx" ON "TimeEntry"("resourceId", "workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_engagementId_idx" ON "TimeEntry"("engagementId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PoolResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "PortfolioEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

