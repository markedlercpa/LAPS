-- CreateEnum
CREATE TYPE "BookingLocationType" AS ENUM ('ZOOM', 'PHONE', 'IN_PERSON', 'CUSTOM');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "bookedVia" TEXT,
ADD COLUMN     "cancelToken" TEXT,
ADD COLUMN     "eventTypeId" TEXT,
ADD COLUMN     "inviteeEmail" TEXT,
ADD COLUMN     "inviteeName" TEXT,
ADD COLUMN     "inviteePhone" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleToken" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "BookingHost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT,
    "welcome" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "zoomLink" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityOverride" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "startMin" INTEGER,
    "endMin" INTEGER,

    CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEventType" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "locationType" "BookingLocationType" NOT NULL DEFAULT 'ZOOM',
    "location" TEXT,
    "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMin" INTEGER NOT NULL DEFAULT 240,
    "rollingDays" INTEGER NOT NULL DEFAULT 60,
    "maxPerDay" INTEGER,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEventType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingHost_userId_key" ON "BookingHost"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingHost_slug_key" ON "BookingHost"("slug");

-- CreateIndex
CREATE INDEX "AvailabilityRule_hostId_idx" ON "AvailabilityRule"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityOverride_hostId_date_key" ON "AvailabilityOverride"("hostId", "date");

-- CreateIndex
CREATE INDEX "BookingEventType_hostId_idx" ON "BookingEventType"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEventType_hostId_slug_key" ON "BookingEventType"("hostId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_rescheduleToken_key" ON "Appointment"("rescheduleToken");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_cancelToken_key" ON "Appointment"("cancelToken");

-- CreateIndex
CREATE INDEX "Appointment_eventTypeId_idx" ON "Appointment"("eventTypeId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "BookingEventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHost" ADD CONSTRAINT "BookingHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "BookingHost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "BookingHost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventType" ADD CONSTRAINT "BookingEventType_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "BookingHost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

