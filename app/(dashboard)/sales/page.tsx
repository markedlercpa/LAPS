import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { MicroLabel } from "@/components/micro-label";
import { SalesTable, type SalesRow } from "@/components/sales/sales-table";
import { HandoffStatusSelect } from "@/components/sales/handoff-status-select";
import { OnboardingChecklist } from "@/components/sales/onboarding-checklist";
import { lineItemsTotal } from "@/lib/reporting";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const won = await prisma.proposal.findMany({
    where: { status: "WON" },
    orderBy: { wonAt: "desc" },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      owner: { select: { name: true, email: true } },
      lineItems: { select: { quantity: true, unitPrice: true } },
      handoff: { include: { checklist: { orderBy: { sortOrder: "asc" } } } },
    },
  });

  const clientName = (l: { firstName: string; lastName: string; companyName: string | null }) =>
    l.companyName ?? `${l.firstName} ${l.lastName}`;

  const rows: SalesRow[] = won.map((p) => {
    const total = p.handoff?.checklist.length ?? 0;
    const done = p.handoff?.checklist.filter((c) => c.done).length ?? 0;
    return {
      id: p.id,
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
        description="Closed-won clients, delivery handoffs, and onboarding checklists."
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

      <section className="mt-14">
        <MicroLabel>Onboarding &amp; handoffs</MicroLabel>
        {won.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">No closed-won clients yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 border-t-2 border-divider max-md:grid-cols-1">
            {won.map((p) => (
              <div
                key={p.id}
                className="border-b border-r border-divider py-6 pr-6 max-md:border-r-0 [&:nth-child(2n)]:border-r-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="mb-0.5">
                      <Link href={`/leads/${p.lead.id}`} className="text-ink no-underline hover:text-accent-700">
                        {clientName(p.lead)}
                      </Link>
                    </h4>
                    <p className="mb-0 text-[12px] text-muted">
                      {formatCurrency(lineItemsTotal(p.lineItems))} · Won {formatDate(p.wonAt)}
                    </p>
                  </div>
                  {p.handoff && (
                    <HandoffStatusSelect handoffId={p.handoff.id} status={p.handoff.deliveryStatus} />
                  )}
                </div>
                <div className="mt-4 border-t-2 border-divider pt-2">
                  {p.handoff ? (
                    <OnboardingChecklist
                      items={p.handoff.checklist.map((c) => ({ id: c.id, label: c.label, done: c.done }))}
                    />
                  ) : (
                    <p className="mb-0 text-[14px] text-muted">No handoff record.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
