-- CreateTable
CREATE TABLE "LeadMagnetView" (
    "id" TEXT NOT NULL,
    "magnetId" TEXT NOT NULL,
    "source" TEXT,
    "contentItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMagnetView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadMagnetView_magnetId_idx" ON "LeadMagnetView"("magnetId");

-- AddForeignKey
ALTER TABLE "LeadMagnetView" ADD CONSTRAINT "LeadMagnetView_magnetId_fkey" FOREIGN KEY ("magnetId") REFERENCES "LeadMagnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

