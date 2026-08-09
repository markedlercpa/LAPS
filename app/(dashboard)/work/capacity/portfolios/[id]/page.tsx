import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { AddAdjustmentButton } from "@/components/work/add-adjustment";
import { portfolioPnl } from "@/lib/work/pnl";
import { centsToUsd } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

const HOARD_LABEL: Record<string, string> = {
  green: "Healthy (≥85%)",
  yellow: "Watch (70–85%)",
  red: "Hoarding (<70%)",
  na: "No bookings yet",
};

export default async function PortfolioPnlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const portfolio = await prisma.portfolio.findUnique({ where: { id }, select: { directorEmail: true } });
  if (!portfolio) notFound();
  const isAdmin = session?.user?.role === "ADMIN";
  const isOwner = session?.user?.email && session.user.email.toLowerCase() === portfolio.directorEmail.toLowerCase();
  if (!isAdmin && !isOwner) notFound(); // directors see only their own P&L

  const pnl = await portfolioPnl(id);
  if (!pnl) notFound();

  const rows: { label: string; value: number; strong?: boolean; accent?: boolean; sub?: boolean }[] = [
    { label: "Recognized revenue (% complete)", value: pnl.recognizedRevenueCents },
    { label: "− Consumed labor", value: -pnl.consumedLaborCents, sub: true },
    { label: "− Booked-unused labor", value: -pnl.bookedUnusedCents, sub: true, accent: pnl.bookedUnusedCents > 0 },
    { label: "= Contribution", value: pnl.contributionCents, strong: true },
    { label: "− Director base (annual)", value: -pnl.directorCostCents, sub: true },
    { label: "± Adjustments", value: pnl.adjustmentsCents, sub: true },
    { label: "= Gross Profit", value: pnl.grossProfitCents, strong: true, accent: pnl.grossProfitCents < 0 },
  ];

  const b = pnl.bonus;

  return (
    <div>
      <PageHeader
        eyebrow={`Work — Capacity · ${pnl.portfolio.directorName}`}
        title={pnl.portfolio.name}
        description="Portfolio P&L to date, the live bonus readout, and the anti-hoarding gauge. Recognized revenue uses % completion; booked-unused labor is its own line."
      >
        <AddAdjustmentButton portfolioId={pnl.portfolio.id} />
        <Link href="/work/capacity/portfolios" className="btn btn-secondary">All portfolios</Link>
      </PageHeader>

      <MetricRow
        metrics={[
          { label: "Recognized revenue", value: centsToUsd(pnl.recognizedRevenueCents) },
          { label: "Gross Profit", value: centsToUsd(pnl.grossProfitCents), accent: pnl.grossProfitCents < 0 },
          { label: "GP %", value: pct(pnl.gpPct) },
          { label: "Bonus — if year ended today", value: centsToUsd(b.payoutCents), note: b.cliffApplied ? "below cliff → $0" : `${pct(b.attainment)} of target` },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="micro-label mb-2">Portfolio P&L (to date)</div>
          <table className="table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.strong ? "border-t-2 border-ink" : ""}>
                  <td className={`${r.strong ? "font-heading font-extrabold" : r.sub ? "pl-4 text-muted" : ""}`}>{r.label}</td>
                  <td className={`num ${r.strong ? "font-heading font-extrabold" : ""} ${r.accent ? "text-accent-700" : ""}`}>
                    {centsToUsd(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {/* Bonus readout */}
          <div className="card p-4">
            <div className="micro-label mb-2">Bonus readout</div>
            <dl className="space-y-1 text-[13px]">
              <Row k="Par bonus (5% of declared)" v={centsToUsd(b.parBonusCents)} />
              <Row k="Target GP" v={centsToUsd(b.targetGpCents)} />
              <Row k="Attainment (GP ÷ target)" v={pct(b.attainment)} />
              <Row k={`Cliff (below ${pct(1 - pnl.portfolio.cliffBandPct)} of target → $0)`} v={b.cliffApplied ? "applied" : "clear"} />
              <div className="mt-2 flex items-center justify-between border-t-2 border-divider pt-2 font-heading font-extrabold">
                <span>Payout if year ended today</span>
                <span>{centsToUsd(b.payoutCents)}</span>
              </div>
            </dl>
          </div>

          {/* Hoarding gauge */}
          <div className="card p-4">
            <div className="micro-label mb-2">Booking efficiency (trailing 8 weeks)</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-[28px] font-heading font-extrabold ${pnl.hoarding.band === "red" ? "text-accent-700" : ""}`}>
                {pnl.hoarding.ratio == null ? "—" : `${Math.round(pnl.hoarding.ratio * 100)}%`}
              </span>
              <span className="tag tag-neutral">{HOARD_LABEL[pnl.hoarding.band]}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {pnl.hoarding.consumed}h consumed ÷ {pnl.hoarding.booked}h booked. Under 70% signals hoarding capacity.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="micro-label mb-2">Engagements</div>
        {pnl.engagements.length === 0 ? (
          <p className="text-[14px] text-muted">No engagements in this portfolio yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="num">Recognized</th>
                <th className="num">Consumed labor</th>
                <th className="num">GP</th>
                <th className="num">Burn</th>
              </tr>
            </thead>
            <tbody>
              {pnl.engagements.map((e) => (
                <tr key={e.id}>
                  <td className="font-heading font-extrabold">
                    <Link href={`/work/capacity/engagements/${e.id}`} className="text-accent-700">{e.client}</Link>
                    {e.overBudget && <span className="tag tag-accent ml-2">over budget</span>}
                  </td>
                  <td className="num">{centsToUsd(e.recognizedRevenueCents)}</td>
                  <td className="num">{centsToUsd(e.consumedCostCents)}</td>
                  <td className={`num ${e.gpCents < 0 ? "text-accent-700" : ""}`}>{centsToUsd(e.gpCents)}</td>
                  <td className="num">{pct(e.burnPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}
