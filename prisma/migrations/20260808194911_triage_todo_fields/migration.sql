-- CreateEnum
CREATE TYPE "GtdBucket" AS ENUM ('INBOX', 'NEXT', 'WAITING', 'SCHEDULED', 'SOMEDAY');

-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "context" TEXT,
ADD COLUMN     "gtd" "GtdBucket" NOT NULL DEFAULT 'INBOX',
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ActionItem_gtd_idx" ON "ActionItem"("gtd");

