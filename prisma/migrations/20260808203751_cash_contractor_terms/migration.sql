-- AlterTable
ALTER TABLE "CashFlowLine" ADD COLUMN     "netTermsDays" INTEGER,
ADD COLUMN     "paidWhenPaid" BOOLEAN NOT NULL DEFAULT false;

