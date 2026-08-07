-- CreateEnum
CREATE TYPE "CapacityBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'RELEASED', 'CONSUMED_CLOSED', 'DECLINED');

-- CreateTable
CREATE TABLE "RoleBand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetUtilization" DECIMAL(4,3) NOT NULL DEFAULT 0.80,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleBandRate" (
    "id" TEXT NOT NULL,
    "roleBandId" TEXT NOT NULL,
    "loadedRateCents" INTEGER NOT NULL,
    "billRateCents" INTEGER,
    "effectiveFrom" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleBandRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolResource" (
    "id" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "karbonUserId" TEXT,
    "roleBandId" TEXT NOT NULL,
    "weeklyCapacityHours" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "skillTags" TEXT[],
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "PoolResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "directorName" TEXT NOT NULL,
    "directorEmail" TEXT NOT NULL,
    "directorCostCentsAnnual" INTEGER NOT NULL DEFAULT 0,
    "declaredPortfolioRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "gpTargetPct" DECIMAL(5,4) NOT NULL DEFAULT 0.50,
    "bonusCliffBandPct" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
    "directorBillableFloorPct" DECIMAL(5,4) NOT NULL DEFAULT 0.45,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioEngagement" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "karbonWorkItemKey" TEXT,
    "engagementType" TEXT NOT NULL DEFAULT 'other',
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "revenueRecognition" TEXT NOT NULL DEFAULT 'fixed_on_completion',
    "startWeek" TEXT,
    "endWeek" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "PortfolioEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementRoleBudget" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "roleBandId" TEXT NOT NULL,
    "budgetedHours" DECIMAL(7,2) NOT NULL DEFAULT 0,

    CONSTRAINT "EngagementRoleBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityBooking" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "roleBandId" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "hoursBooked" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "hoursConsumed" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "CapacityBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "rateCentsSnapshot" INTEGER,
    "requestedBy" TEXT,
    "confirmedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "chargeFlag" BOOLEAN NOT NULL DEFAULT false,
    "unbookedConsumption" BOOLEAN NOT NULL DEFAULT false,
    "overBudgetAck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapacityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleBand_name_key" ON "RoleBand"("name");

-- CreateIndex
CREATE INDEX "RoleBandRate_roleBandId_idx" ON "RoleBandRate"("roleBandId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBandRate_roleBandId_effectiveFrom_key" ON "RoleBandRate"("roleBandId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PoolResource_email_key" ON "PoolResource"("email");

-- CreateIndex
CREATE INDEX "PoolResource_roleBandId_idx" ON "PoolResource"("roleBandId");

-- CreateIndex
CREATE INDEX "Portfolio_active_idx" ON "Portfolio"("active");

-- CreateIndex
CREATE INDEX "PortfolioEngagement_portfolioId_idx" ON "PortfolioEngagement"("portfolioId");

-- CreateIndex
CREATE INDEX "PortfolioEngagement_karbonWorkItemKey_idx" ON "PortfolioEngagement"("karbonWorkItemKey");

-- CreateIndex
CREATE INDEX "EngagementRoleBudget_engagementId_idx" ON "EngagementRoleBudget"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementRoleBudget_engagementId_roleBandId_key" ON "EngagementRoleBudget"("engagementId", "roleBandId");

-- CreateIndex
CREATE INDEX "CapacityBooking_portfolioId_isoWeek_idx" ON "CapacityBooking"("portfolioId", "isoWeek");

-- CreateIndex
CREATE INDEX "CapacityBooking_resourceId_isoWeek_idx" ON "CapacityBooking"("resourceId", "isoWeek");

-- CreateIndex
CREATE INDEX "CapacityBooking_engagementId_idx" ON "CapacityBooking"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityBooking_engagementId_resourceId_isoWeek_key" ON "CapacityBooking"("engagementId", "resourceId", "isoWeek");

-- AddForeignKey
ALTER TABLE "RoleBandRate" ADD CONSTRAINT "RoleBandRate_roleBandId_fkey" FOREIGN KEY ("roleBandId") REFERENCES "RoleBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolResource" ADD CONSTRAINT "PoolResource_roleBandId_fkey" FOREIGN KEY ("roleBandId") REFERENCES "RoleBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioEngagement" ADD CONSTRAINT "PortfolioEngagement_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementRoleBudget" ADD CONSTRAINT "EngagementRoleBudget_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "PortfolioEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementRoleBudget" ADD CONSTRAINT "EngagementRoleBudget_roleBandId_fkey" FOREIGN KEY ("roleBandId") REFERENCES "RoleBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityBooking" ADD CONSTRAINT "CapacityBooking_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "PortfolioEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityBooking" ADD CONSTRAINT "CapacityBooking_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityBooking" ADD CONSTRAINT "CapacityBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PoolResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityBooking" ADD CONSTRAINT "CapacityBooking_roleBandId_fkey" FOREIGN KEY ("roleBandId") REFERENCES "RoleBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

