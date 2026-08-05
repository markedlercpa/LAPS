import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { SegToggle } from "@/components/ui/seg";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";
import { LeadsBoard, type BoardLead } from "@/components/leads/leads-board";
import { NewLeadButton } from "@/components/leads/new-lead-button";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const isBoard = view === "board";

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true, email: true } } },
  });

  const ownerName = (o: { name: string | null; email: string } | null) =>
    o?.name ?? o?.email ?? "Unassigned";

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    companyName: l.companyName,
    leadSource: l.leadSource,
    email: l.email,
    phone: l.phone,
    stage: l.stage,
    ownerName: ownerName(l.owner),
    trustScore: l.trustScore,
    createdAt: l.createdAt.toISOString(),
  }));

  const boardLeads: BoardLead[] = leads.map((l) => ({
    id: l.id,
    stage: l.stage,
    firstName: l.firstName,
    lastName: l.lastName,
    companyName: l.companyName,
    leadSource: l.leadSource,
    ownerName: ownerName(l.owner),
    trustScore: l.trustScore,
  }));

  const activeCount = leads.filter(
    (l) => l.stage !== "CLOSED_WON" && l.stage !== "CLOSED_LOST",
  ).length;
  const newThisWeek = leads.filter(
    (l) => l.createdAt.getTime() > Date.now() - 7 * 86_400_000,
  ).length;

  const seg = (
    <SegToggle
      param="view"
      defaultValue="table"
      options={[
        { value: "table", label: "Table" },
        { value: "board", label: "Board" },
      ]}
    />
  );

  return (
    <div>
      <PageHeader
        eyebrow="01 — L"
        title="Lead Generation"
        description="All leads and their interaction history."
      >
        <NewLeadButton />
      </PageHeader>

      <MetricRow
        metrics={[
          { label: "Total leads", value: leads.length },
          { label: "Active (open)", value: activeCount },
          { label: "New this week", value: newThisWeek },
        ]}
      />

      <div className="mt-8">
        {isBoard ? (
          <>
            <div className="mb-4">{seg}</div>
            <LeadsBoard leads={boardLeads} />
          </>
        ) : (
          <LeadsTable rows={rows} toolbarLeft={seg} />
        )}
      </div>
    </div>
  );
}
