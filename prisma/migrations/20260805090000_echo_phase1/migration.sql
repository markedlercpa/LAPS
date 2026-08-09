-- CreateEnum
CREATE TYPE "QoOPillar" AS ENUM ('EARNINGS', 'CASH_FLOW', 'REPORTING', 'GROWTH', 'TAXATION', 'CAPITAL', 'LIFESTYLE', 'VALUATION');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PAIN_POINT', 'OBJECTION', 'MYTH', 'PRIZE_STATE', 'CLIENT_STORY', 'METHODOLOGY', 'QUOTE', 'DATA_POINT');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('SALES_CALL', 'CLIENT_ENGAGEMENT', 'FIREFLIES_TRANSCRIPT', 'EMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "Consent" AS ENUM ('INTERNAL_ONLY', 'ANONYMIZED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CardCategory" AS ENUM ('HOOK', 'REFRAME', 'MANTRA', 'OBJECTION_KILL', 'PRIZE_FRAME', 'MECHANISM_NAME');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('CANDIDATE', 'ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "source" "EvidenceSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "rawText" TEXT NOT NULL,
    "distilled" TEXT,
    "clientRef" TEXT,
    "consent" "Consent" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "pillarTags" "QoOPillar"[],
    "icpFit" BOOLEAN NOT NULL DEFAULT false,
    "icpNotes" TEXT,
    "strength" INTEGER NOT NULL DEFAULT 3,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodologyDoc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT NOT NULL,
    "pillarTags" "QoOPillar"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodologyDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallingCard" (
    "id" TEXT NOT NULL,
    "cardText" TEXT NOT NULL,
    "category" "CardCategory" NOT NULL,
    "pillarTags" "QoOPillar"[],
    "status" "CardStatus" NOT NULL DEFAULT 'CANDIDATE',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "performanceIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallingCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedPhrase" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CardEvidence" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CardEvidence_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "EvidenceRecord_type_idx" ON "EvidenceRecord"("type");

-- CreateIndex
CREATE INDEX "EvidenceRecord_source_idx" ON "EvidenceRecord"("source");

-- CreateIndex
CREATE UNIQUE INDEX "MethodologyDoc_slug_key" ON "MethodologyDoc"("slug");

-- CreateIndex
CREATE INDEX "CallingCard_status_idx" ON "CallingCard"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BannedPhrase_phrase_key" ON "BannedPhrase"("phrase");

-- CreateIndex
CREATE INDEX "_CardEvidence_B_index" ON "_CardEvidence"("B");

-- AddForeignKey
ALTER TABLE "_CardEvidence" ADD CONSTRAINT "_CardEvidence_A_fkey" FOREIGN KEY ("A") REFERENCES "CallingCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CardEvidence" ADD CONSTRAINT "_CardEvidence_B_fkey" FOREIGN KEY ("B") REFERENCES "EvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

