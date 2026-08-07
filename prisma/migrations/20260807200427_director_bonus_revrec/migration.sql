-- AlterTable
ALTER TABLE "PoolResource" ADD COLUMN     "costExempt" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "parBonusPct" DECIMAL(5,4) NOT NULL DEFAULT 0.05;

-- AlterTable
ALTER TABLE "PortfolioEngagement" ALTER COLUMN "revenueRecognition" SET DEFAULT 'pct_hours';

