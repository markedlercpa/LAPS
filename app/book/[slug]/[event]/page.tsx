import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeSlots, loadEventForSlots } from "@/lib/booking";
import { BookingFlow, type Question } from "@/components/booking/booking-flow";

export const dynamic = "force-dynamic";

export default async function BookEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; event: string }>;
  searchParams: Promise<{ reschedule?: string }>;
}) {
  const { slug, event: eventSlug } = await params;
  const { reschedule } = await searchParams;

  const host = await prisma.bookingHost.findUnique({
    where: { slug },
    include: { user: { select: { name: true } } },
  });
  if (!host || !host.active) notFound();

  const event = await prisma.bookingEventType.findFirst({
    where: { hostId: host.id, slug: eventSlug, active: true },
  });
  if (!event) notFound();

  // Reschedule mode: validate the token belongs to this event type.
  let rescheduleToken: string | null = null;
  let existingWhenISO: string | null = null;
  if (reschedule) {
    const appt = await prisma.appointment.findUnique({
      where: { rescheduleToken: reschedule },
      select: { eventTypeId: true, status: true, scheduledAt: true },
    });
    if (appt && appt.eventTypeId === event.id && appt.status !== "CANCELED") {
      rescheduleToken = reschedule;
      existingWhenISO = appt.scheduledAt.toISOString();
    }
  }

  const { rules, overrides } = await loadEventForSlots(host.id, event.id);
  const slots = await computeSlots({
    hostUserId: host.userId,
    timezone: host.timezone,
    rules,
    overrides,
    durationMin: event.durationMin,
    bufferBeforeMin: event.bufferBeforeMin,
    bufferAfterMin: event.bufferAfterMin,
    minNoticeMin: event.minNoticeMin,
    rollingDays: event.rollingDays,
    windowBusinessDays: event.windowBusinessDays,
    maxPerDay: event.maxPerDay,
    excludeAppointmentId: undefined,
  });

  const questions: Question[] = Array.isArray(event.questions)
    ? (event.questions as Question[])
    : [];

  return (
    <BookingFlow
      hostSlug={host.slug}
      hostName={host.displayName || host.user?.name || "Booking"}
      hostTimezone={host.timezone}
      eventTypeId={event.id}
      eventName={event.name}
      eventDescription={event.description}
      durationMin={event.durationMin}
      locationType={event.locationType}
      slots={slots}
      questions={questions}
      rescheduleToken={rescheduleToken}
      existingWhenISO={existingWhenISO}
    />
  );
}
