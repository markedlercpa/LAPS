import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewEngagementButton } from "@/components/work/new-engagement";
import { centsToUsd, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_STATUS_LABELS, labelFor } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function CapacityEngagementsPage() {
  const [engagements, portfolios] = await Promise.all([
    prisma.portfolioEngagement.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        portfolio: { select: { name: true } },
        budgets: { select: { budgetedHours: true } },
        bookings: { select: { hoursConsumed: true } },
      },
      take: 300,
    }),
    prisma.portfolio.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = engagements.map((e) => ({
    id: e.id,
    client: e.clientName,
    portfolio: e.portfolio.name,
    type: labelFor(ENGAGEMENT_TYPE_LABELS as Record<string, string>, e.engagementType),
    status: labelFor(ENGAGEMENT_STATUS_LABELS as Record<string, string>, e.status),
    revenue: e.revenueCents,
    budgeted: e.budgets.reduce((s, b) => s + Number(b.budgetedHours), 0),
    consumed: e.bookings.reduce((s, b) => s + Number(b.hoursConsumed), 0),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Engagements"
        description="Client work items with an hours budget by role band. Karbon actuals flow into consumed hours; each engagement's economics tie revenue to loaded-rate labor cost."
      >
        <NewEngagementButton portfolios={portfolios} />
      </PageHeader>

      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">
          {portfolios.length === 0
            ? "Create a portfolio first, then add engagements to it."
            : "No engagements yet. Create one to set its hours budget."}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Portfolio</th>
              <th>Type</th>
              <th className="num">Revenue</th>
              <th className="num">Budget h</th>
              <th className="num">Consumed h</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-heading font-extrabold">
                  <Link href={`/work/capacity/engagements/${r.id}`} className="text-accent-700">{r.client}</Link>
                </td>
                <td className="text-muted">{r.portfolio}</td>
                <td className="text-muted">{r.type}</td>
                <td className="num">{centsToUsd(r.revenue)}</td>
                <td className="num">{r.budgeted}</td>
                <td className="num">{r.consumed}</td>
                <td><span className="tag tag-neutral">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
