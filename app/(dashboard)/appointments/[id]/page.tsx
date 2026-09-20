import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MicroLabel } from "@/components/micro-label";
import { AppointmentStatusSelect } from "@/components/appointments/appointment-status-select";
import { DeleteAppointmentButton } from "@/components/appointments/delete-appointment-button";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { formatDateInZone, formatTimeInZone } from "@/lib/booking-time";

export const dynamic = "force-dynamic";

async function origin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
}

type Question = { id: string; label: string };

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true } },
      owner: { select: { name: true, email: true } },
      eventType: { select: { name: true, slug: true, questions: true, host: { select: { slug: true } } } },
      actionItems: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!appt) notFound();

  const tz = appt.timezone || "America/New_York";
  const start = appt.scheduledAt;
  const whenDate = formatDateInZone(start, tz);
  const whenTime = formatTimeInZone(start, tz);

  const base = await origin();
  const hostSlug = appt.eventType?.host?.slug;
  const rescheduleUrl =
    hostSlug && appt.eventType && appt.rescheduleToken
      ? `${base}/book/${hostSlug}/${appt.eventType.slug}?reschedule=${appt.rescheduleToken}`
      : null;
  const cancelUrl = appt.cancelToken ? `${base}/book/cancel/${appt.cancelToken}` : null;

  // Map screening answers (keyed by question id) to their labels.
  const questions = Array.isArray(appt.eventType?.questions)
    ? (appt.eventType?.questions as Question[])
    : [];
  const answers = (appt.answers && typeof appt.answers === "object" ? appt.answers : {}) as Record<string, string>;
  const answerRows = Object.entries(answers).map(([qid, value]) => ({
    label: questions.find((q) => q.id === qid)?.label ?? qid,
    value,
  }));

  const details: [string, React.ReactNode][] = [
    ["When", `${whenDate} · ${whenTime} (${tz})`],
    ["Duration", `${appt.durationMin} min`],
    ["Event type", appt.eventType?.name ?? "—"],
    ["Location", appt.meetingUrl ? <a href={appt.meetingUrl} target="_blank" rel="noreferrer" className="text-accent-700">{appt.location ?? appt.meetingUrl}</a> : appt.location ?? "—"],
    ["Invitee", appt.inviteeName ? `${appt.inviteeName}${appt.inviteeEmail ? ` <${appt.inviteeEmail}>` : ""}` : "—"],
    ["Invitee phone", appt.inviteePhone ?? "—"],
    ["Owner", appt.owner?.name ?? appt.owner?.email ?? "—"],
    ["Booked via", appt.bookedVia === "booking_page" ? "Public booking page" : "Manual"],
    ["Outlook synced", appt.graphEventId ? "Yes" : "No"],
    ["Reminder sent", appt.reminderSentAt ? formatDate(appt.reminderSentAt) : "Not yet"],
    ["Created", formatDate(appt.createdAt)],
  ];

  return (
    <div>
      <Link href="/appointments" className="btn btn-ghost mb-4 -ml-1">
        <ArrowLeft className="h-4 w-4" /> Back to appointments
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1">{appt.title}</h1>
          <p className="mb-0 flex items-center gap-1.5 text-muted">
            <Building2 className="h-4 w-4" />
            <Link href={`/leads/${appt.lead.id}`} className="text-accent-700">
              {appt.lead.firstName} {appt.lead.lastName}
              {appt.lead.companyName ? ` · ${appt.lead.companyName}` : ""}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="micro-label">Status</span>
          <AppointmentStatusSelect id={appt.id} status={appt.status} />
          <DeleteAppointmentButton id={appt.id} />
        </div>
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-8 border-t-2 border-divider pt-6 max-lg:grid-cols-1">
        {/* Left: details */}
        <div>
          <MicroLabel>Details</MicroLabel>
          <dl className="mb-6 mt-2">
            {details.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-2 border-b border-divider py-2.5">
                <dt className="micro-label">{k}</dt>
                <dd className="m-0 text-[13px]">{v}</dd>
              </div>
            ))}
          </dl>

          {(rescheduleUrl || cancelUrl) && (
            <>
              <MicroLabel>Manage links (client-facing)</MicroLabel>
              <div className="mt-2 space-y-2">
                {rescheduleUrl && (
                  <a href={rescheduleUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-accent-700">
                    <ExternalLink className="h-3.5 w-3.5" /> Reschedule link
                  </a>
                )}
                {cancelUrl && (
                  <a href={cancelUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-accent-700">
                    <ExternalLink className="h-3.5 w-3.5" /> Cancel link
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: screening answers, notes, action items */}
        <div className="space-y-6">
          {answerRows.length > 0 && (
            <div>
              <MicroLabel>Screening answers</MicroLabel>
              <dl className="mt-2">
                {answerRows.map((a) => (
                  <div key={a.label} className="border-b border-divider py-2.5">
                    <dt className="micro-label">{a.label}</dt>
                    <dd className="m-0 mt-1 text-[14px]">{a.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {appt.notes && (
            <div>
              <MicroLabel>Notes</MicroLabel>
              <p className="mt-2 whitespace-pre-wrap text-[14px]">{appt.notes}</p>
            </div>
          )}

          <div>
            <MicroLabel>Action items ({appt.actionItems.length})</MicroLabel>
            {appt.actionItems.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">
                None. Add tasks from the Appointments list&apos;s action-items panel.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {appt.actionItems.map((i) => (
                  <li key={i.id} className="flex items-center justify-between border-b border-divider py-2 text-[14px]">
                    <span className={i.status === "DONE" ? "text-muted line-through" : ""}>{i.description}</span>
                    <span className="micro-label text-neutral-500">
                      {i.dueDate ? formatDate(i.dueDate) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
