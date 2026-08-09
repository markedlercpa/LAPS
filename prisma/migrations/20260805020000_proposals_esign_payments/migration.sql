-- CreateEnum
CREATE TYPE "PaymentScheduleType" AS ENUM ('ONE_TIME', 'DEPOSIT_THEN_BALANCE', 'INSTALLMENTS', 'RECURRING');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "coverLetter" TEXT,
ADD COLUMN     "paymentScheduleType" "PaymentScheduleType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "recurringInterval" TEXT,
ADD COLUMN     "scopeNarrative" TEXT,
ADD COLUMN     "signedIp" TEXT,
ADD COLUMN     "signedUserAgent" TEXT,
ADD COLUMN     "signerEmail" TEXT,
ADD COLUMN     "signerName" TEXT,
ADD COLUMN     "termsText" TEXT,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProposalPayment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueOn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalPayment_proposalId_idx" ON "ProposalPayment"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_publicToken_key" ON "Proposal"("publicToken");

-- AddForeignKey
ALTER TABLE "ProposalPayment" ADD CONSTRAINT "ProposalPayment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

