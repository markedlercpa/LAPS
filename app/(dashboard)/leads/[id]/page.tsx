import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Building2, Tag } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/status-badge";
import { LeadActivityPanel } from "@/components/leads/lead-activity-panel";
import { LeadStageSelect } from "@/components/leads/lead-stage-select";
import { EditLeadButton } from "@/components/leads/edit-lead-button";
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
    },
  });

  if (!lead) notFound();

  const activities: ActivityRow[] = lead.activities.map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt.toISOString(),
    userName: a.user?.name ?? a.user?.email ?? "System",
  }));

  return (
    <div>
      <Link href="/leads">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Button>
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {lead.firstName} {lead.lastName}
          </h1>
          {lead.companyName && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {lead.companyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail icon={<StageBadge stage={lead.stage} />} label="Stage" />
              <Detail
                icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                label={lead.email ?? "—"}
              />
              <Detail
                icon={<Phone className="h-4 w-4 text-muted-foreground" />}
                label={lead.phone ?? "—"}
              />
              <Detail
                icon={<Tag className="h-4 w-4 text-muted-foreground" />}
                label={lead.leadSource ?? "—"}
              />
              <div className="border-t pt-3 text-xs text-muted-foreground">
                Owner: {lead.owner?.name ?? lead.owner?.email ?? "Unassigned"}
                <br />
                Created: {formatDate(lead.createdAt)}
              </div>
              {lead.notes && (
                <div className="border-t pt-3">
                  <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Notes
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{lead.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Appointments ({lead.appointments.length})
                </div>
                {lead.appointments.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  lead.appointments.map((a) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{formatDate(a.scheduledAt)}</span>
                      <span className="text-muted-foreground">
                        {APPOINTMENT_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t pt-3">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Proposals ({lead.proposals.length})
                </div>
                {lead.proposals.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  lead.proposals.map((p) => (
                    <Link
                      key={p.id}
                      href={`/proposals/${p.id}`}
                      className="flex justify-between hover:underline"
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="text-muted-foreground">
                        {PROPOSAL_STATUS_LABELS[p.status]}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: activity */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadActivityPanel
                leadId={lead.id}
                leadEmail={lead.email}
                activities={activities}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </div>
  );
}
