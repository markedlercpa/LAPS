-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "amountPaid" DECIMAL(12,2),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_stripeSessionId_key" ON "Proposal"("stripeSessionId");

