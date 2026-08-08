import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewPortfolioButton } from "@/components/work/new-portfolio";
import { directorEconomics } from "@/lib/work/capacity";
import { centsToUsd } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const sp = await searchParams;
  const all = await prisma.portfolio.findMany({
    orderBy: [{ fiscalYear: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { engagements: true } } },
  });
  const fyOptions = Array.from(new Set(all.map((p) => p.fiscalYear).filter((y): y is number => y != null))).sort((a, b) => b - a);
  const fySel = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : null;
  const portfolios = fySel ? all.filter((p) => p.fiscalYear === fySel) : all;

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Portfolios"
        description="Each Portfolio Director's book of clients — the P&L unit. Declared revenue and GP target drive the bonus readout (Phase 3)."
      >
        <NewPortfolioButton />
      </PageHeader>

      {fyOptions.length > 0 && (
        <form method="get" className="mb-4 flex items-end gap-2">
          <label className="field">
            <span className="micro-label">Fiscal year</span>
            <select name="fy" defaultValue={fySel ?? ""} className="input">
              <option value="">All years</option>
              {fyOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">Filter</button>
        </form>
      )}

      {portfolios.length === 0 ? (
        <p className="text-[14px] text-muted">No portfolios{fySel ? ` for FY${fySel}` : ""} yet. Create one to start assigning engagements.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>FY</th>
              <th>Director</th>
              <th className="num">Declared revenue</th>
              <th className="num">Base (%)</th>
              <th className="num">Par bonus (5%)</th>
              <th className="num">On-target</th>
              <th className="num">Engagements</th>
            </tr>
          </thead>
          <tbody>
            {portfolios.map((p) => {
              const de = directorEconomics({
                declaredPortfolioRevenueCents: p.declaredPortfolioRevenueCents,
                directorCostCentsAnnual: p.directorCostCentsAnnual,
                parBonusPct: Number(p.parBonusPct),
              });
              return (
                <tr key={p.id}>
                  <td className="font-heading font-extrabold">
                    <Link href={`/work/capacity/portfolios/${p.id}`} className="text-accent-700">{p.name}</Link>
                  </td>
                  <td className="text-muted">{p.fiscalYear ?? "—"}</td>
                  <td className="text-muted">{p.directorName}</td>
                  <td className="num">{centsToUsd(p.declaredPortfolioRevenueCents)}</td>
                  <td className="num">
                    {centsToUsd(de.baseCents)}
                    {de.basePct != null && <span className="text-muted"> · {Math.round(de.basePct * 100)}%</span>}
                  </td>
                  <td className="num">{centsToUsd(de.parBonusCents)}</td>
                  <td className="num">
                    {centsToUsd(de.onTargetCents)}
                    {de.onTargetPct != null && <span className="text-muted"> · {Math.round(de.onTargetPct * 100)}%</span>}
                  </td>
                  <td className="num">{p._count.engagements}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
