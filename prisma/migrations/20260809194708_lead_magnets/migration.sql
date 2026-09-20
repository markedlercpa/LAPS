-- CreateEnum
CREATE TYPE "LeadMagnetKind" AS ENUM ('EBOOK', 'TEMPLATE', 'TOOL', 'QUIZ', 'AUDIT_CALL', 'CALCULATOR', 'QBO_SNAPSHOT', 'WEBINAR', 'EMAIL_COURSE');

-- CreateEnum
CREATE TYPE "LeadMagnetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "ctaMagnetId" TEXT;

-- CreateTable
CREATE TABLE "LeadMagnet" (
    "id" TEXT NOT NULL,
    "kind" "LeadMagnetKind" NOT NULL DEFAULT 'EBOOK',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LeadMagnetStatus" NOT NULL DEFAULT 'DRAFT',
    "headline" TEXT,
    "subhead" TEXT,
    "body" TEXT,
    "ctaLabel" TEXT,
    "baseScore" INTEGER NOT NULL DEFAULT 15,
    "fileStorageKey" TEXT,
    "fileName" TEXT,
    "fileContentType" TEXT,
    "fileSizeBytes" INTEGER,
    "downloadUrl" TEXT,
    "deliverByEmail" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMagnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMagnetSubmission" (
    "id" TEXT NOT NULL,
    "magnetId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "answers" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "contentItemId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMagnetSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadMagnet_slug_key" ON "LeadMagnet"("slug");

-- CreateIndex
CREATE INDEX "LeadMagnet_status_idx" ON "LeadMagnet"("status");

-- CreateIndex
CREATE INDEX "LeadMagnet_kind_idx" ON "LeadMagnet"("kind");

-- CreateIndex
CREATE INDEX "LeadMagnetSubmission_magnetId_idx" ON "LeadMagnetSubmission"("magnetId");

-- CreateIndex
CREATE INDEX "LeadMagnetSubmission_leadId_idx" ON "LeadMagnetSubmission"("leadId");

-- CreateIndex
CREATE INDEX "LeadMagnetSubmission_email_idx" ON "LeadMagnetSubmission"("email");

-- CreateIndex
CREATE INDEX "ContentItem_ctaMagnetId_idx" ON "ContentItem"("ctaMagnetId");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_ctaMagnetId_fkey" FOREIGN KEY ("ctaMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMagnetSubmission" ADD CONSTRAINT "LeadMagnetSubmission_magnetId_fkey" FOREIGN KEY ("magnetId") REFERENCES "LeadMagnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMagnetSubmission" ADD CONSTRAINT "LeadMagnetSubmission_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMagnetSubmission" ADD CONSTRAINT "LeadMagnetSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

