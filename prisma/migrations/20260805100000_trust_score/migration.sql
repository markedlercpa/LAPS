-- CreateEnum
CREATE TYPE "TrustSignalKind" AS ENUM ('CONTENT_VIEW', 'CONTENT_ENGAGE', 'EMAIL_REPLY', 'MEETING_ATTENDED', 'WEBINAR', 'DOWNLOAD', 'REFERRAL', 'INBOUND_INQUIRY', 'MANUAL');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrustSignal" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "TrustSignalKind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "note" TEXT,
    "contentRef" TEXT,
    "source" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrustSignal_leadId_idx" ON "TrustSignal"("leadId");

-- AddForeignKey
ALTER TABLE "TrustSignal" ADD CONSTRAINT "TrustSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

