import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { ProposalsTable, type ProposalRow } from "@/components/proposals/proposals-table";
import { NewProposalButton, type LeadOption } from "@/components/proposals/new-proposal-button";
import { lineItemsTotal } from "@/lib/reporting";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function leadName(l: { firstName: string; lastName: string; companyName: string | null }) {
  return l.companyName ?? `${l.firstName} ${l.lastName}`;
}

export default async function ProposalsPage() {
  const [proposals, leads] = await Promise.all([
    prisma.proposal.findMany({
      where: { status: { notIn: ["WON", "LOST"] } },
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { firstName: true, lastName: true, companyName: true } },
        owner: { select: { name: true, email: true } },
        lineItems: { select: { quantity: true, unitPrice: true } },
      },
    }),
    prisma.lead.findMany({
      where: { stage: { notIn: ["CLOSED_LOST", "CLOSED_WON"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, firstName: true, lastName: true, companyName: true },
    }),
  ]);

  const rows: ProposalRow[] = proposals.map((p) => {
    const contractValue = lineItemsTotal(p.lineItems);
    const delivery = Number(p.estimatedDeliveryCost);
    const margin = contractValue - delivery;
    return {
      id: p.id,
      title: p.title,
      leadName: leadName(p.lead),
      ownerName: p.owner?.name ?? p.owner?.email ?? "—",
      status: p.status,
      contractValue,
      margin,
      marginPct: contractValue > 0 ? (margin / contractValue) * 100 : 0,
      createdAt: p.createdAt.toISOString(),
    };
  });

  const leadOptions: LeadOption[] = leads.map((l) => ({
    id: l.id,
    name: leadName(l),
  }));

  const totalOpenValue = rows.reduce((s, r) => s + r.contractValue, 0);

  return (
    <div>
      <PageHeader
        eyebrow="03 — P"
        title="Proposals"
        description="Open proposals with scope, pricing, and internal margin."
      >
        <NewProposalButton leads={leadOptions} />
      </PageHeader>

      <div className="mb-8">
        <MetricRow
          metrics={[
            { label: "Open proposals", value: rows.length },
            { label: "Open pipeline value", value: formatCurrency(totalOpenValue) },
            {
              label: "Avg margin",
              value: `${
                rows.length
                  ? Math.round(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length)
                  : 0
              }%`,
            },
          ]}
        />
      </div>

      <ProposalsTable rows={rows} emptyMessage="No open proposals. Create one to get started." />
    </div>
  );
}
