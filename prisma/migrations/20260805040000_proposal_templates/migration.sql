-- CreateEnum
CREATE TYPE "SnippetType" AS ENUM ('COVER', 'SCOPE', 'TERMS');

-- CreateTable
CREATE TABLE "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultTitle" TEXT NOT NULL,
    "coverLetter" TEXT,
    "scopeNarrative" TEXT,
    "termsText" TEXT,
    "paymentScheduleType" "PaymentScheduleType" NOT NULL DEFAULT 'ONE_TIME',
    "recurringInterval" TEXT,
    "defaultDeliveryCost" DECIMAL(12,2),
    "lineItems" JSONB NOT NULL,
    "payments" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionSnippet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SnippetType" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SectionSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalTemplate_key_key" ON "ProposalTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SectionSnippet_key_key" ON "SectionSnippet"("key");

-- CreateIndex
CREATE INDEX "SectionSnippet_type_idx" ON "SectionSnippet"("type");

