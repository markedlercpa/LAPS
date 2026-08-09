import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StageBadge } from "@/components/status-badge";
import { MicroLabel } from "@/components/micro-label";
import { LeadActivityPanel } from "@/components/leads/lead-activity-panel";
import { LeadStageSelect } from "@/components/leads/lead-stage-select";
import { EditLeadButton } from "@/components/leads/edit-lead-button";
import { LeadTrustPanel, type TrustSignalRow } from "@/components/leads/lead-trust-panel";
import { TrustBadge } from "@/components/leads/trust-badge";
import type { ActivityRow } from "@/components/leads/activity-timeline";
import { formatDate } from "@/lib/utils";
import { PROPOSAL_STATUS_LABELS, APPOINTMENT_STATUS_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      activities: {
        orderBy: { occurredAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      },
      appointments: { orderBy: { scheduledAt: "desc" } },
      proposals: { orderBy: { createdAt: "desc" } },
      trustSignals: { orderBy: { occurredAt: "desc" } },
    },
  });

  if (!lead) notFound();

  const trustSignals: TrustSignalRow[] = lead.trustSignals.map((s) => ({
    id: s.id,
    kind: s.kind,
    weight: s.weight,
    note: s.note,
    source: s.source,
    occurredAt: s.occurredAt.toISOString(),
  }));

  const activities: ActivityRow[] = lead.activities.map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt.toISOString(),
    userName: a.user?.name ?? a.user?.email ?? "System",
  }));

  const details: [string, React.ReactNode][] = [
    ["Stage", <StageBadge key="s" stage={lead.stage} />],
    ["Email", lead.email ?? "—"],
    ["Phone", lead.phone ?? "—"],
    ["Source", lead.leadSource ?? "—"],
    ["Owner", lead.owner?.name ?? lead.owner?.email ?? "Unassigned"],
    ["Created", formatDate(lead.createdAt)],
  ];

  return (
    <div>
      <Link href="/leads" className="btn btn-ghost mb-4 -ml-1">
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1">
            {lead.firstName} {lead.lastName}
          </h1>
          {lead.companyName && (
            <p className="mb-0 flex items-center gap-1.5 text-muted">
              <Building2 className="h-4 w-4" />
              {lead.companyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TrustBadge score={lead.trustScore} />
          <LeadStageSelect leadId={lead.id} stage={lead.stage} />
          <EditLeadButton
            leadId={lead.id}
            initial={{
              firstName: lead.firstName,
              lastName: lead.lastName,
              companyName: lead.companyName ?? "",
              leadSource: lead.leadSource ?? "",
              email: lead.email ?? "",
              phone: lead.phone ?? "",
              notes: lead.notes ?? "",
              revenueEstimate: lead.revenueEstimate != null ? String(lead.revenueEstimate) : "",
              headcountEstimate: lead.headcountEstimate != null ? String(lead.headcountEstimate) : "",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[330px_1fr] border-t-2 border-divider max-lg:grid-cols-1">
        {/* Left column */}
        <div className="border-r border-divider py-6 pr-8 max-lg:border-r-0 max-lg:pr-0">
          <MicroLabel>Details</MicroLabel>
          <dl className="mb-6 mt-2">
            {details.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[88px_1fr] gap-2 border-b border-divider py-2.5">
                <dt className="micro-label">{k}</dt>
                <dd className="m-0 text-[13px]">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mb-6">
            <LeadTrustPanel leadId={lead.id} score={lead.trustScore} signals={trustSignals} />
          </div>

          <MicroLabel>Related</MicroLabel>
          <div className="mt-2 text-[13px]">
            <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-[.08em] text-neutral-600">
              Appointments ({lead.appointments.length})
            </div>
            {lead.appointments.length === 0 ? (
              <p className="mb-0 text-muted">None</p>
            ) : (
              lead.appointments.map((a) => (
                <div key={a.id} className="flex justify-between border-b border-divider py-1.5">
                  <span>{formatDate(a.scheduledAt)}</span>
                  <span className="text-muted">{APPOINTMENT_STATUS_LABELS[a.status]}</span>
                </div>
              ))
            )}
            <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[.08em] text-neutral-600">
              Proposals ({lead.proposals.length})
            </div>
            {lead.proposals.length === 0 ? (
              <p className="mb-0 text-muted">None</p>
            ) : (
              lead.proposals.map((p) => (
                <Link
                  key={p.id}
                  href={`/proposals/${p.id}`}
                  className="flex justify-between border-b border-divider py-1.5 text-accent-700 no-underline"
                >
                  <span className="truncate">{p.title}</span>
                  <span>{PROPOSAL_STATUS_LABELS[p.status]}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="py-6 pl-8 max-lg:pl-0">
          <LeadActivityPanel leadId={lead.id} leadEmail={lead.email} activities={activities} />
        </div>
      </div>
    </div>
  );
}
