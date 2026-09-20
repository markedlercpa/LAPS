-- CreateEnum
CREATE TYPE "ProspectResearchStatus" AS ENUM ('TO_RESEARCH', 'RESEARCHED', 'READY');

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "fitNotes" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "researchStatus" "ProspectResearchStatus" NOT NULL DEFAULT 'TO_RESEARCH',
ADD COLUMN     "signal" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ProspectTouch" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "byUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectTouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectTouch_prospectId_idx" ON "ProspectTouch"("prospectId");

-- CreateIndex
CREATE INDEX "Prospect_researchStatus_idx" ON "Prospect"("researchStatus");

-- AddForeignKey
ALTER TABLE "ProspectTouch" ADD CONSTRAINT "ProspectTouch_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

