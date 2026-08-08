import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { MicroLabel } from "@/components/micro-label";
import { HandoffStatusSelect } from "@/components/sales/handoff-status-select";
import { OnboardingChecklist } from "@/components/sales/onboarding-checklist";
import { AddHandoffTask } from "@/components/sales/add-handoff-task";
import { lineItemsTotal } from "@/lib/reporting";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const p = await prisma.proposal.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
      owner: { select: { name: true, email: true } },
      lineItems: true,
      handoff: { include: { checklist: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!p || p.status !== "WON") notFound();

  const clientName = p.lead.companyName ?? `${p.lead.firstName} ${p.lead.lastName}`;
  const value = lineItemsTotal(p.lineItems);
  const checklist = p.handoff?.checklist ?? [];
  const done = checklist.filter((c) => c.done).length;

  return (
    <div>
      <PageHeader
        eyebrow={p.contractId ? `Contract ${p.contractId}` : "04 — S"}
        title={clientName}
        description="Closed-won client. Work the sales-to-delivery handoff below before the delivery team takes over."
      >
        {p.handoff && <HandoffStatusSelect handoffId={p.handoff.id} status={p.handoff.deliveryStatus} />}
      </PageHeader>

      <MetricRow
        metrics={[
          { label: "Contract value", value: formatCurrency(value) },
          { label: "Won", value: formatDate(p.wonAt) },
          { label: "Owner", value: p.owner?.name ?? p.owner?.email ?? "—" },
          { label: "Handoff", value: checklist.length ? `${done}/${checklist.length} done` : "—", accent: true },
        ]}
      />

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8 border-t-2 border-divider pt-6 max-lg:grid-cols-1">
        <section>
          <MicroLabel>Sales → delivery handoff</MicroLabel>
          <p className="mb-0 mt-2 text-[13px] text-muted">
            Everything delivery needs to start clean. Check items off as you complete them; add anything specific to this engagement.
          </p>
          <div className="mt-4">
            {p.handoff ? (
              <>
                <OnboardingChecklist items={checklist.map((c) => ({ id: c.id, label: c.label, done: c.done }))} />
                <AddHandoffTask handoffId={p.handoff.id} />
              </>
            ) : (
              <p className="text-[14px] text-muted">No handoff record for this deal.</p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <div>
            <MicroLabel>Client</MicroLabel>
            <div className="mt-2 text-[14px]">
              <Link href={`/leads/${p.lead.id}`} className="text-accent-700">{clientName}</Link>
              {p.lead.email && <div className="text-muted">{p.lead.email}</div>}
              {p.lead.phone && <div className="text-muted">{p.lead.phone}</div>}
            </div>
          </div>
          <div>
            <MicroLabel>Proposal</MicroLabel>
            <div className="mt-2 text-[14px]">
              <Link href={`/proposals/${p.id}`} className="text-accent-700">{p.title}</Link>
              <div className="text-muted">{p.lineItems.length} line item{p.lineItems.length === 1 ? "" : "s"} · {formatCurrency(value)}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
