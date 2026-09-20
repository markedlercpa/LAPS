import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CapacityGrid } from "@/components/work/capacity-grid";
import { WeekSettlement } from "@/components/work/week-settlement";
import { capacityGrid, pendingCount } from "@/lib/work/bookings";
import { computeWeekCharges } from "@/lib/work/weekclose";
import { upcomingWeeks } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

const WEEKS = 8;

export default async function GridPage() {
  const weeks = upcomingWeeks(WEEKS);
  const [grid, engagements, pending, closes] = await Promise.all([
    capacityGrid(weeks),
    prisma.portfolioEngagement.findMany({
      where: { status: { not: "complete" } },
      orderBy: { clientName: "asc" },
      select: { id: true, clientName: true, portfolio: { select: { name: true } } },
    }),
    pendingCount(),
    prisma.weekClose.findMany({ where: { isoWeek: { in: weeks } }, select: { isoWeek: true } }),
  ]);
  const closedSet = new Set(closes.map((c) => c.isoWeek));

  // Charge preview / total per week (computed live for open weeks; snapshot cost is the same shape).
  const weekRows = await Promise.all(
    weeks.map(async (w) => {
      const { totalCents } = await computeWeekCharges(w);
      return { isoWeek: w, closed: closedSet.has(w), totalCents };
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Capacity grid"
        description="Book pool resources by ISO week. Green under 75%, amber 75–100%, red overbooked. Click a cell to view or request bookings. Release before Wednesday 17:00 ET the prior week to avoid the charge."
      >
        <Link href="/work/capacity/queue" className="btn btn-secondary">
          Booking queue{pending > 0 ? ` · ${pending}` : ""}
        </Link>
      </PageHeader>

      <CapacityGrid
        resources={grid.resources}
        weeks={grid.weeks}
        cells={grid.cells}
        bookings={grid.bookings}
        closedWeeks={grid.closedWeeks}
        engagements={engagements.map((e) => ({ id: e.id, label: `${e.clientName} · ${e.portfolio.name}` }))}
      />

      <div className="mt-8">
        <WeekSettlement weeks={weekRows} />
      </div>
    </div>
  );
}
