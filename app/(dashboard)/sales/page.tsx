import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        title="Sales Closed"
        description="Closed-won clients, delivery handoffs, and onboarding checklists."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Closed Won" value={won.length} />
        <StatCard label="Total Value" value={formatCurrency(totalValue)} />
        <StatCard label="Pending Handoff" value={pendingHandoff} />
        <StatCard label="In Delivery" value={inDelivery} />
      </div>

      <div className="space-y-8">
        <SalesTable rows={rows} />

        <div>
          <h2 className="mb-3 text-lg font-semibold">Onboarding & Handoffs</h2>
          {won.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed-won clients yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {won.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          <Link href={`/leads/${p.lead.id}`} className="hover:underline">
                            {clientName(p.lead)}
                          </Link>
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatCurrency(lineItemsTotal(p.lineItems))} · Won{" "}
                          {formatDate(p.wonAt)}
                        </p>
                      </div>
                      {p.handoff && (
                        <HandoffStatusSelect
                          handoffId={p.handoff.id}
                          status={p.handoff.deliveryStatus}
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {p.handoff ? (
                      <OnboardingChecklist
                        items={p.handoff.checklist.map((c) => ({
                          id: c.id,
                          label: c.label,
                          done: c.done,
                        }))}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No handoff record.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
