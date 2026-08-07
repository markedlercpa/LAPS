import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { EngagementBudgetEditor } from "@/components/work/engagement-budget";
import { engagementEconomics, listRoleBands } from "@/lib/work/capacity";
import { centsToUsd, ENGAGEMENT_TYPE_LABELS, labelFor } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [eng, econ, bands] = await Promise.all([
    prisma.portfolioEngagement.findUnique({ where: { id }, include: { portfolio: { select: { name: true } } } }),
    engagementEconomics(id),
    listRoleBands(),
  ]);
  if (!eng || !econ) notFound();

  const initialBudget: Record<string, number> = {};
  for (const l of econ.lines) initialBudget[l.roleBandId] = l.budgetedHours;

  const maxHours = Math.max(1, ...econ.lines.map((l) => Math.max(l.budgetedHours, l.consumedHours)));
  const bar = (h: number) => `${Math.min(100, (h / maxHours) * 100)}%`;

  return (
    <div>
      <PageHeader
        eyebrow={`Work — Capacity · ${eng.portfolio.name}`}
        title={eng.clientName}
        description={labelFor(ENGAGEMENT_TYPE_LABELS as Record<string, string>, eng.engagementType)}
      >
        <Link href={`/work/capacity/time?engagement=${eng.id}`} className="btn btn-secondary">Log time</Link>
        <Link href="/work/capacity/engagements" className="btn btn-secondary">All engagements</Link>
      </PageHeader>

      <MetricRow
        metrics={[
          { label: "Revenue", value: centsToUsd(econ.revenueCents) },
          { label: "Consumed labor", value: centsToUsd(econ.totals.consumedCostCents) },
          { label: "Engagement GP", value: centsToUsd(econ.grossProfitCents), accent: econ.grossProfitCents < 0 },
          {
            label: "Realized rate",
            value: econ.realizedRateCents != null ? `${centsToUsd(econ.realizedRateCents)}/h` : "—",
            note: econ.burnPct != null ? `${Math.round(econ.burnPct * 100)}% of budget consumed` : undefined,
          },
        ]}
      />

      {econ.overBudget && (
        <p className="mt-3 tag tag-accent inline-block">Over budget — consumed hours exceed the plan.</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="micro-label mb-2">Budget vs booked vs consumed, by role band</div>
          <table className="table">
            <thead>
              <tr>
                <th>Role band</th>
                <th className="num">Budget h</th>
                <th className="num">Booked h</th>
                <th className="num">Consumed h</th>
                <th className="num">Consumed cost</th>
              </tr>
            </thead>
            <tbody>
              {econ.lines.length === 0 ? (
                <tr><td colSpan={5} className="text-muted">No budget or activity yet. Set a budget →</td></tr>
              ) : (
                econ.lines.map((l) => (
                  <tr key={l.roleBandId}>
                    <td className="font-heading font-extrabold">
                      {l.band}
                      <div className="mt-1 flex h-2 w-full max-w-[220px] gap-px bg-[color:var(--color-neutral-200)]">
                        <span className="block bg-ink" style={{ width: bar(l.budgetedHours) }} title={`Budget ${l.budgetedHours}h`} />
                      </div>
                      <div className="mt-px flex h-2 w-full max-w-[220px] gap-px">
                        <span
                          className={`block ${l.consumedHours > l.budgetedHours && l.budgetedHours > 0 ? "bg-accent" : "bg-neutral-500"}`}
                          style={{ width: bar(l.consumedHours) }}
                          title={`Consumed ${l.consumedHours}h`}
                        />
                      </div>
                    </td>
                    <td className="num">{l.budgetedHours}</td>
                    <td className="num">{l.bookedHours}</td>
                    <td className="num">{l.consumedHours}</td>
                    <td className="num">{centsToUsd(l.consumedCostCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {econ.lines.length > 0 && (
              <tfoot>
                <tr>
                  <td className="font-heading font-extrabold">Total</td>
                  <td className="num">{econ.totals.budgeted}</td>
                  <td className="num">{econ.totals.booked}</td>
                  <td className="num">{econ.totals.consumed}</td>
                  <td className="num">{centsToUsd(econ.totals.consumedCostCents)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="mt-2 text-[12px] text-muted">
            Booked hours populate once the hoteling board ships (Phase 2). Consumed hours come from logged time (Work → Time).
          </p>
        </div>

        <EngagementBudgetEditor
          engagementId={eng.id}
          bands={bands.map((b) => ({ id: b.id, name: b.name }))}
          initial={initialBudget}
        />
      </div>
    </div>
  );
}
