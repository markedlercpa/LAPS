import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";
import { NewLeadButton } from "@/components/leads/new-lead-button";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true, email: true } } },
  });

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    companyName: l.companyName,
    leadSource: l.leadSource,
    email: l.email,
    phone: l.phone,
    stage: l.stage,
    ownerName: l.owner?.name ?? l.owner?.email ?? "Unassigned",
    createdAt: l.createdAt.toISOString(),
  }));

  const activeCount = leads.filter(
    (l) => l.stage !== "CLOSED_WON" && l.stage !== "CLOSED_LOST",
  ).length;
  const newThisWeek = leads.filter(
    (l) => l.createdAt.getTime() > Date.now() - 7 * 86_400_000,
  ).length;

  return (
    <div>
      <PageHeader
        title="Lead Generation"
        description="All leads and their interaction history."
      >
        <NewLeadButton />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Leads" value={leads.length} />
        <StatCard label="Active (open)" value={activeCount} />
        <StatCard label="New this week" value={newThisWeek} />
      </div>

      <LeadsTable rows={rows} />
    </div>
  );
}
