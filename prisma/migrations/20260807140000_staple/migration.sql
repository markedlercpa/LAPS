-- CreateEnum
CREATE TYPE "StapleStage" AS ENUM ('STAGING', 'TAKEOFF', 'ASSEMBLE', 'PACKAGE', 'DELIVERED', 'LEVERAGE', 'EVANGELIZE', 'CLOSED');

-- CreateEnum
CREATE TYPE "InfoStatus" AS ENUM ('RECEIVED', 'REQUESTED', 'PROMISED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "InfoSource" AS ENUM ('SALES_HANDOFF', 'CLIENT_UPLOAD', 'EMAIL', 'KICKOFF', 'PRIOR_ENGAGEMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "OwnerSide" AS ENUM ('US', 'CLIENT', 'THIRD_PARTY');

-- CreateTable
CREATE TABLE "StapleClient" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dba" TEXT,
    "industry" TEXT,
    "tier" TEXT,
    "ownerId" TEXT,
    "leadId" TEXT,
    "externalRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StapleClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "commPrefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "stage" "StapleStage" NOT NULL DEFAULT 'STAGING',
    "ownerId" TEXT,
    "preparerId" TEXT,
    "reviewerId" TEXT,
    "pod" TEXT,
    "proposalId" TEXT,
    "handoffId" TEXT,
    "leadId" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "dealMeta" JSONB,
    "handoffSummary" JSONB,
    "targetDates" JSONB,
    "statusFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementTerms" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "services" JSONB NOT NULL DEFAULT '[]',
    "fee" DECIMAL(12,2),
    "feeType" TEXT,
    "paymentSchedule" JSONB,
    "timeline" JSONB,
    "scopeNarrative" TEXT,
    "scopeInclusions" JSONB NOT NULL DEFAULT '[]',
    "scopeExclusions" JSONB NOT NULL DEFAULT '[]',
    "mutuallyAgreed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfoItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "canonicalKey" TEXT,
    "label" TEXT NOT NULL,
    "status" "InfoStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "InfoSource" NOT NULL DEFAULT 'MANUAL',
    "ownerSide" "OwnerSide" NOT NULL DEFAULT 'CLIENT',
    "fileAssetId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT,
    "clientId" TEXT,
    "infoItemId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "storageKey" TEXT,
    "contentHash" TEXT,
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "uploadedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'native',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "fromStage" "StapleStage",
    "toStage" "StapleStage" NOT NULL,
    "byUserId" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StapleClient_leadId_key" ON "StapleClient"("leadId");

-- CreateIndex
CREATE INDEX "StapleClient_ownerId_idx" ON "StapleClient"("ownerId");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_proposalId_key" ON "Engagement"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_handoffId_key" ON "Engagement"("handoffId");

-- CreateIndex
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");

-- CreateIndex
CREATE INDEX "Engagement_stage_idx" ON "Engagement"("stage");

-- CreateIndex
CREATE INDEX "Engagement_ownerId_idx" ON "Engagement"("ownerId");

-- CreateIndex
CREATE INDEX "EngagementTerms_engagementId_idx" ON "EngagementTerms"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementTerms_engagementId_version_key" ON "EngagementTerms"("engagementId", "version");

-- CreateIndex
CREATE INDEX "InfoItem_clientId_idx" ON "InfoItem"("clientId");

-- CreateIndex
CREATE INDEX "InfoItem_engagementId_idx" ON "InfoItem"("engagementId");

-- CreateIndex
CREATE INDEX "InfoItem_status_idx" ON "InfoItem"("status");

-- CreateIndex
CREATE INDEX "FileAsset_engagementId_idx" ON "FileAsset"("engagementId");

-- CreateIndex
CREATE INDEX "FileAsset_clientId_idx" ON "FileAsset"("clientId");

-- CreateIndex
CREATE INDEX "StageTransition_engagementId_idx" ON "StageTransition"("engagementId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StapleClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StapleClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementTerms" ADD CONSTRAINT "EngagementTerms_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfoItem" ADD CONSTRAINT "InfoItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StapleClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfoItem" ADD CONSTRAINT "InfoItem_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

