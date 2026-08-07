import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewPortfolioButton } from "@/components/work/new-portfolio";
import { centsToUsd } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { engagements: true } } },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Portfolios"
        description="Each Portfolio Director's book of clients — the P&L unit. Declared revenue and GP target drive the bonus readout (Phase 3)."
      >
        <NewPortfolioButton />
      </PageHeader>

      {portfolios.length === 0 ? (
        <p className="text-[14px] text-muted">No portfolios yet. Create one to start assigning engagements.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Director</th>
              <th className="num">Declared revenue</th>
              <th className="num">GP target</th>
              <th className="num">Engagements</th>
            </tr>
          </thead>
          <tbody>
            {portfolios.map((p) => (
              <tr key={p.id}>
                <td className="font-heading font-extrabold">{p.name}</td>
                <td className="text-muted">{p.directorName}</td>
                <td className="num">{centsToUsd(p.declaredPortfolioRevenueCents)}</td>
                <td className="num">{Math.round(Number(p.gpTargetPct) * 100)}%</td>
                <td className="num">{p._count.engagements}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
