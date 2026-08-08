import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { ProspectsTable, type ProspectRow } from "@/components/prospecting/prospects-table";
import { ProspectingToolbar } from "@/components/prospecting/prospecting-toolbar";

export const dynamic = "force-dynamic";

export default async function ProspectingPage() {
  const prospects = await prisma.prospect.findMany({
    orderBy: [{ tier: "asc" }, { companyName: "asc" }],
    include: { owner: { select: { name: true, email: true } } },
  });

  const rows: ProspectRow[] = prospects.map((p) => ({
    id: p.id,
    companyName: p.companyName,
    contactName: p.contactName,
    title: p.title,
    industry: p.industry,
    tier: p.tier,
    status: p.status,
    revenueEstimate: p.revenueEstimate != null ? Number(p.revenueEstimate) : null,
    headcountEstimate: p.headcountEstimate,
    source: p.source,
    ownerName: p.owner?.name ?? p.owner?.email ?? "Unassigned",
    promotedLeadId: p.promotedLeadId,
  }));

  const active = prospects.filter((p) => !["PROMOTED", "DISQUALIFIED"].includes(p.status)).length;
  const engaged = prospects.filter((p) => p.status === "ENGAGED").length;
  const promoted = prospects.filter((p) => p.status === "PROMOTED").length;

  return (
    <div>
      <PageHeader
        eyebrow="01b — ABM"
        title="Prospecting"
        description="Cold outbound target accounts for the Dream 100 sequence. Import a list, work them through the warming sequence, and promote to a Lead when they engage."
      >
        <ProspectingToolbar />
      </PageHeader>

      <MetricRow
        metrics={[
          { label: "Total prospects", value: prospects.length },
          { label: "Active", value: active },
          { label: "Engaged", value: engaged },
          { label: "Promoted", value: promoted, accent: true },
        ]}
      />

      <div className="mt-8">
        <ProspectsTable rows={rows} />
      </div>
    </div>
  );
}
