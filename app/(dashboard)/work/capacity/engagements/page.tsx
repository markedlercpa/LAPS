import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewEngagementButton } from "@/components/work/new-engagement";
import { centsToUsd, ENGAGEMENT_TYPES, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_STATUSES, ENGAGEMENT_STATUS_LABELS, labelFor } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function CapacityEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const where: Prisma.PortfolioEngagementWhereInput = {
    ...(sp.portfolio ? { portfolioId: sp.portfolio } : {}),
    ...(sp.status && ENGAGEMENT_STATUSES.includes(sp.status as (typeof ENGAGEMENT_STATUSES)[number]) ? { status: sp.status } : {}),
    ...(sp.type && ENGAGEMENT_TYPES.includes(sp.type as (typeof ENGAGEMENT_TYPES)[number]) ? { engagementType: sp.type } : {}),
  };

  const [engagements, portfolios] = await Promise.all([
    prisma.portfolioEngagement.findMany({
      where,
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

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="field">
          <span className="micro-label">Portfolio</span>
          <select name="portfolio" defaultValue={sp.portfolio ?? ""} className="input">
            <option value="">All</option>
            {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="micro-label">Type</span>
          <select name="type" defaultValue={sp.type ?? ""} className="input">
            <option value="">All</option>
            {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{ENGAGEMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="micro-label">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">All</option>
            {ENGAGEMENT_STATUSES.map((s) => <option key={s} value={s}>{ENGAGEMENT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>

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
