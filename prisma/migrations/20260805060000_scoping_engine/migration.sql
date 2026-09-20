-- CreateEnum
CREATE TYPE "StaffLevel" AS ENUM ('ASSOCIATE', 'SENIOR', 'MANAGER', 'DIRECTOR', 'PARTNER');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "salesMarkupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salesMarkupPct" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RateCardLevel" (
    "level" "StaffLevel" NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "bill" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateCardLevel_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "ScopingLine" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "level" "StaffLevel" NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScopingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScopingLine_proposalId_idx" ON "ScopingLine"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ScopingLine_proposalId_level_key" ON "ScopingLine"("proposalId", "level");

-- AddForeignKey
ALTER TABLE "ScopingLine" ADD CONSTRAINT "ScopingLine_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

