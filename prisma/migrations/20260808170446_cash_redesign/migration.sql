-- AlterTable
ALTER TABLE "CashFlowLine" DROP COLUMN "kind",
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "category" SET DEFAULT 'other_operating';

-- AlterTable
ALTER TABLE "CashPosition" ADD COLUMN     "apDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "arDays" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "capexMonthlyCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dnaMonthlyCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locLimitCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locOpeningCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "useQboOpening" BOOLEAN NOT NULL DEFAULT true;

-- DropEnum
DROP TYPE "CashFlowKind";

