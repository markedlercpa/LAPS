import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateInZone, formatTimeInZone } from "@/lib/booking-time";
import { CancelBooking } from "@/components/booking/cancel-booking";

export const dynamic = "force-dynamic";

export default async function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { cancelToken: token },
    include: { eventType: { include: { host: { include: { user: { select: { name: true } } } } } } },
  });
  if (!appt) notFound();

  const tz = appt.timezone || appt.eventType?.host.timezone || "America/New_York";
  const hostName = appt.eventType?.host.displayName || appt.eventType?.host.user?.name || "the host";
  const alreadyCanceled = appt.status === "CANCELED";

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <div className="micro-label">Manage booking</div>
      <h1 className="mt-1">{appt.eventType?.name ?? appt.title}</h1>
      <p className="mt-1 text-muted">with {hostName}</p>
      <p className="mt-3 font-heading text-[18px] font-extrabold">
        {formatDateInZone(appt.scheduledAt, tz)} · {formatTimeInZone(appt.scheduledAt, tz)}
      </p>

      {alreadyCanceled ? (
        <p className="mt-6 text-muted">This booking has already been canceled.</p>
      ) : (
        <>
          <p className="mt-6 text-[14px] text-muted">Cancel this booking? The time will be freed up.</p>
          <CancelBooking token={token} />
        </>
      )}
    </div>
  );
}
