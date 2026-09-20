-- DropForeignKey
ALTER TABLE "LedgerAccount" DROP CONSTRAINT "LedgerAccount_mappedReportingAccountId_fkey";

-- DropForeignKey
ALTER TABLE "VarianceNote" DROP CONSTRAINT "VarianceNote_reportingAccountId_fkey";

-- DropIndex
DROP INDEX "LedgerAccount_mappedReportingAccountId_idx";

-- DropIndex
DROP INDEX "VarianceNote_entityId_reportingAccountId_periodMonth_key";

-- AlterTable
ALTER TABLE "LedgerAccount" DROP COLUMN "mappedReportingAccountId",
ADD COLUMN     "accountSubType" TEXT,
ADD COLUMN     "classification" TEXT,
ADD COLUMN     "fqName" TEXT,
ADD COLUMN     "parentExternalId" TEXT;

-- AlterTable
ALTER TABLE "VarianceNote" DROP COLUMN "reportingAccountId",
ADD COLUMN     "accountKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "VarianceNote_entityId_accountKey_periodMonth_key" ON "VarianceNote"("entityId", "accountKey", "periodMonth");

