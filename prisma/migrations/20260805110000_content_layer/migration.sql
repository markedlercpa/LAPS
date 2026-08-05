-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('LINKEDIN', 'X', 'EMAIL', 'NEWSLETTER', 'BLOG', 'YOUTUBE', 'PODCAST', 'WEBSITE', 'BOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModuleKind" AS ENUM ('BOOK', 'CAMPAIGN', 'SERIES', 'COURSE', 'OTHER');

-- CreateTable
CREATE TABLE "ContentModule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ModuleKind" NOT NULL DEFAULT 'CAMPAIGN',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "ContentChannel" NOT NULL DEFAULT 'LINKEDIN',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "format" TEXT,
    "summary" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "pillarTags" "QoOPillar"[],
    "moduleId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceItemId" TEXT,
    "publishedUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContentCards" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContentCards_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContentEvidence" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContentEvidence_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ContentItem_status_idx" ON "ContentItem"("status");

-- CreateIndex
CREATE INDEX "ContentItem_channel_idx" ON "ContentItem"("channel");

-- CreateIndex
CREATE INDEX "ContentItem_moduleId_idx" ON "ContentItem"("moduleId");

-- CreateIndex
CREATE INDEX "_ContentCards_B_index" ON "_ContentCards"("B");

-- CreateIndex
CREATE INDEX "_ContentEvidence_B_index" ON "_ContentEvidence"("B");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ContentModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentCards" ADD CONSTRAINT "_ContentCards_A_fkey" FOREIGN KEY ("A") REFERENCES "CallingCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentCards" ADD CONSTRAINT "_ContentCards_B_fkey" FOREIGN KEY ("B") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentEvidence" ADD CONSTRAINT "_ContentEvidence_A_fkey" FOREIGN KEY ("A") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentEvidence" ADD CONSTRAINT "_ContentEvidence_B_fkey" FOREIGN KEY ("B") REFERENCES "EvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

