-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('COLD', 'QUEUED', 'IN_SEQUENCE', 'ENGAGED', 'PROMOTED', 'DISQUALIFIED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "headcountEstimate" INTEGER,
ADD COLUMN     "revenueEstimate" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "contractId" TEXT;

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "revenueEstimate" DECIMAL(14,2),
    "headcountEstimate" INTEGER,
    "tier" TEXT NOT NULL DEFAULT 'B',
    "status" "ProspectStatus" NOT NULL DEFAULT 'COLD',
    "source" TEXT,
    "notes" TEXT,
    "ownerId" TEXT,
    "promotedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "leads" INTEGER,
    "apptsBooked" INTEGER,
    "proposalsSent" INTEGER,
    "dealsWon" INTEGER,
    "wonValue" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_promotedLeadId_key" ON "Prospect"("promotedLeadId");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- CreateIndex
CREATE INDEX "Prospect_tier_idx" ON "Prospect"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_granularity_periodStart_key" ON "SalesTarget"("granularity", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_contractId_key" ON "Proposal"("contractId");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

