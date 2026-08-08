import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { SalesTable, type SalesRow } from "@/components/sales/sales-table";
import { lineItemsTotal } from "@/lib/reporting";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const won = await prisma.proposal.findMany({
    where: { status: "WON" },
    orderBy: { wonAt: "desc" },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      owner: { select: { name: true, email: true } },
      lineItems: { select: { quantity: true, unitPrice: true } },
      handoff: { include: { checklist: { select: { done: true } } } },
    },
  });

  const clientName = (l: { firstName: string; lastName: string; companyName: string | null }) =>
    l.companyName ?? `${l.firstName} ${l.lastName}`;

  const rows: SalesRow[] = won.map((p) => {
    const total = p.handoff?.checklist.length ?? 0;
    const done = p.handoff?.checklist.filter((c) => c.done).length ?? 0;
    return {
      id: p.id,
      contractId: p.contractId,
      client: clientName(p.lead),
      value: lineItemsTotal(p.lineItems),
      wonAt: p.wonAt?.toISOString() ?? null,
      deliveryStatus: p.handoff?.deliveryStatus ?? "PENDING",
      progress: total ? `${done}/${total} done` : "—",
      ownerName: p.owner?.name ?? p.owner?.email ?? "—",
      leadId: p.lead.id,
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const inDelivery = won.filter((p) => p.handoff?.deliveryStatus === "IN_PROGRESS").length;
  const pendingHandoff = won.filter(
    (p) => (p.handoff?.deliveryStatus ?? "PENDING") === "PENDING",
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="04 — S"
        title="Sales Closed"
        description="Closed-won clients and their delivery handoffs. Open a client to work the sales-to-delivery handoff checklist."
      />

      <div className="mb-8">
        <MetricRow
          metrics={[
            { label: "Closed won", value: won.length },
            { label: "Total value", value: formatCurrency(totalValue) },
            { label: "Pending handoff", value: pendingHandoff },
            { label: "In delivery", value: inDelivery },
          ]}
        />
      </div>

      <SalesTable rows={rows} />
    </div>
  );
}
