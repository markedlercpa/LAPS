-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "ProposalTemplate" ADD COLUMN     "demoKey" TEXT;

-- CreateTable
CREATE TABLE "DemoTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "metrics" JSONB NOT NULL,
    "tables" JSONB NOT NULL,
    "narrative" TEXT,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoTemplate_key_key" ON "DemoTemplate"("key");

