-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "hubspotId" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "hubspotId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hubspotOwnerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_hubspotId_key" ON "Lead"("hubspotId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_hubspotId_key" ON "Proposal"("hubspotId");

-- CreateIndex
CREATE UNIQUE INDEX "User_hubspotOwnerId_key" ON "User"("hubspotOwnerId");

