import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { SegToggle } from "@/components/ui/seg";
import { AppointmentsView, type ApptRow } from "@/components/appointments/appointments-view";
import { NewAppointmentButton, type LeadOption } from "@/components/appointments/new-appointment-button";
import {
  ActionItemsPanel,
  type ActionItemRow,
  type ApptOption,
} from "@/components/appointments/action-items-panel";
import { ensureHost, ensureStandardEventTypes } from "@/lib/booking";
import { HostSettings } from "@/components/scheduling/host-settings";
import { AvailabilityEditor } from "@/components/scheduling/availability-editor";
import { EventTypeManager, type EventTypeData } from "@/components/scheduling/event-type-manager";

export const dynamic = "force-dynamic";

function leadName(l: { firstName: string; lastName: string; companyName: string | null }) {
  const person = `${l.firstName} ${l.lastName}`;
  return l.companyName ? `${person} · ${l.companyName}` : person;
}

async function originFromHeaders(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
}

const viewToggle = (
  <SegToggle
    param="view"
    defaultValue="booked"
    options={[
      { value: "booked", label: "Appointments" },
      { value: "setup", label: "Booking setup" },
    ]}
  />
);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const view = (await searchParams).view === "setup" ? "setup" : "booked";

  // ── Booking setup tab (formerly /scheduling) ──
  if (view === "setup") {
    const host = await ensureHost(userId);
    await ensureStandardEventTypes(host.id);
    const [rules, events] = await Promise.all([
      prisma.availabilityRule.findMany({ where: { hostId: host.id } }),
      prisma.bookingEventType.findMany({ where: { hostId: host.id }, orderBy: { createdAt: "asc" } }),
    ]);
    const baseUrl = await originFromHeaders();
    const eventData: EventTypeData[] = events.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description,
      durationMin: e.durationMin,
      locationType: e.locationType,
      location: e.location,
      bufferBeforeMin: e.bufferBeforeMin,
      bufferAfterMin: e.bufferAfterMin,
      minNoticeMin: e.minNoticeMin,
      rollingDays: e.rollingDays,
      windowBusinessDays: e.windowBusinessDays,
      maxPerDay: e.maxPerDay,
      active: e.active,
      questions: Array.isArray(e.questions) ? (e.questions as EventTypeData["questions"]) : [],
    }));

    return (
      <div>
        <PageHeader
          eyebrow="Appointments — Booking setup"
          title="Appointments"
          description="Booked calls and your self-serve booking pages, in one place."
        >
          {viewToggle}
        </PageHeader>
        <div className="space-y-6">
          <HostSettings
            host={{
              slug: host.slug,
              displayName: host.displayName,
              timezone: host.timezone,
              zoomLink: host.zoomLink,
              welcome: host.welcome,
              active: host.active,
            }}
            baseUrl={baseUrl}
          />
          <EventTypeManager events={eventData} hostSlug={host.slug} baseUrl={baseUrl} />
          <AvailabilityEditor initial={rules.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin }))} />
        </div>
      </div>
    );
  }

  // ── Appointments tab (booked calls + action items) ──
  const [appointments, leads, actionItems] = await Promise.all([
    prisma.appointment.findMany({
      orderBy: { scheduledAt: "desc" },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.lead.findMany({
      where: { stage: { notIn: ["CLOSED_LOST"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, firstName: true, lastName: true, companyName: true },
    }),
    prisma.actionItem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        appointment: { select: { title: true } },
        lead: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const rows: ApptRow[] = appointments.map((a) => ({
    id: a.id,
    title: a.title,
    leadName: leadName(a.lead),
    leadId: a.lead.id,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMin: a.durationMin,
    status: a.status,
    ownerName: a.owner?.name ?? a.owner?.email ?? "—",
  }));

  const leadOptions: LeadOption[] = leads.map((l) => ({ id: l.id, name: leadName(l) }));

  const itemRows: ActionItemRow[] = actionItems.map((i) => ({
    id: i.id,
    description: i.description,
    dueDate: i.dueDate?.toISOString() ?? null,
    done: i.status === "DONE",
    apptTitle: i.appointment?.title ?? "—",
    leadName: i.lead ? `${i.lead.firstName} ${i.lead.lastName}` : "—",
  }));

  const apptOptions: ApptOption[] = appointments.map((a) => ({
    id: a.id,
    title: `${a.title} · ${a.lead.firstName} ${a.lead.lastName}`,
    leadId: a.lead.id,
  }));

  const now = Date.now();
  const booked = appointments.filter((a) => a.status === "BOOKED").length;
  const completed = appointments.filter((a) => a.status === "COMPLETED").length;
  const upcoming = appointments.filter(
    (a) => a.status === "BOOKED" && a.scheduledAt.getTime() > now,
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Appointments"
        title="Appointments"
        description="Calls booked and completed, with action items."
      >
        {viewToggle}
        <NewAppointmentButton leads={leadOptions} />
      </PageHeader>

      <div className="mb-8">
        <MetricRow
          metrics={[
            { label: "Total", value: appointments.length },
            { label: "Booked", value: booked },
            { label: "Upcoming", value: upcoming },
            { label: "Completed", value: completed },
          ]}
        />
      </div>

      <div className="space-y-6">
        <AppointmentsView rows={rows} />
        <ActionItemsPanel items={itemRows} apptOptions={apptOptions} />
      </div>
    </div>
  );
}
