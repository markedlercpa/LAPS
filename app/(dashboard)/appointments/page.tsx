import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { AppointmentsView, type ApptRow } from "@/components/appointments/appointments-view";
import { NewAppointmentButton, type LeadOption } from "@/components/appointments/new-appointment-button";
import {
  ActionItemsPanel,
  type ActionItemRow,
  type ApptOption,
} from "@/components/appointments/action-items-panel";

export const dynamic = "force-dynamic";

function leadName(l: { firstName: string; lastName: string; companyName: string | null }) {
  const person = `${l.firstName} ${l.lastName}`;
  return l.companyName ? `${person} · ${l.companyName}` : person;
}

export default async function AppointmentsPage() {
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
        eyebrow="02 — A"
        title="Appointments"
        description="Calls booked and completed, with action items."
      >
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
