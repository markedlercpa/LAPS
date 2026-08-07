import { prisma } from "@/lib/prisma";
import { rateForBandWeek } from "@/lib/work/capacity";

/**
 * Weekly charge settlement (spec §5.2). For a week, each portfolio is charged:
 *   consumed_labor = Σ hoursConsumed × rate            (all committed bookings)
 *   booked_unused  = Σ max(0, booked − consumed) × rate (chargeable bookings)
 *   weekly_cost    = consumed_labor + booked_unused
 * Rate = the booking's snapshot, else the band rate effective that week;
 * cost-exempt resources (directors) always rate $0.
 */

export type PortfolioCharge = {
  portfolioId: string;
  portfolioName: string;
  consumedLaborCents: number;
  bookedUnusedCents: number;
  totalCents: number;
};

/** A booking counts toward charges when it's committed (not requested/declined/released). */
function isChargeable(status: string): boolean {
  return status === "CONFIRMED" || status === "CONSUMED_CLOSED";
}

export async function computeWeekCharges(isoWeek: string): Promise<{ charges: PortfolioCharge[]; totalCents: number }> {
  const bookings = await prisma.capacityBooking.findMany({
    where: { isoWeek, status: { notIn: ["DECLINED", "RELEASED"] } },
    include: {
      portfolio: { select: { name: true } },
      resource: { select: { costExempt: true } },
    },
  });

  const rateCache = new Map<string, number>();
  const byPortfolio = new Map<string, PortfolioCharge>();

  for (const b of bookings) {
    let rate = 0;
    if (!b.resource.costExempt) {
      rate = b.rateCentsSnapshot ?? -1;
      if (rate < 0) {
        const key = `${b.roleBandId}|${b.isoWeek}`;
        if (rateCache.has(key)) rate = rateCache.get(key)!;
        else {
          const r = await rateForBandWeek(b.roleBandId, b.isoWeek);
          rate = r?.loadedRateCents ?? 0;
          rateCache.set(key, rate);
        }
      }
    }
    const consumed = Number(b.hoursConsumed);
    const booked = Number(b.hoursBooked);

    const pc =
      byPortfolio.get(b.portfolioId) ??
      { portfolioId: b.portfolioId, portfolioName: b.portfolio.name, consumedLaborCents: 0, bookedUnusedCents: 0, totalCents: 0 };
    pc.consumedLaborCents += Math.round(consumed * rate);
    if (isChargeable(b.status) && booked > consumed) {
      pc.bookedUnusedCents += Math.round((booked - consumed) * rate);
    }
    byPortfolio.set(b.portfolioId, pc);
  }

  const charges = Array.from(byPortfolio.values())
    .map((c) => ({ ...c, totalCents: c.consumedLaborCents + c.bookedUnusedCents }))
    .sort((a, z) => z.totalCents - a.totalCents);
  return { charges, totalCents: charges.reduce((s, c) => s + c.totalCents, 0) };
}

export async function closeWeek(isoWeek: string, closedBy?: string | null): Promise<
  { ok: true; charges: PortfolioCharge[]; totalCents: number } | { ok: false; error: string }
> {
  if (await prisma.weekClose.count({ where: { isoWeek } })) return { ok: false, error: "That week is already closed." };
  const { charges, totalCents } = await computeWeekCharges(isoWeek);

  await prisma.$transaction([
    // Freeze committed bookings: flag booked-unused and mark closed.
    prisma.capacityBooking.updateMany({
      where: { isoWeek, status: "CONFIRMED" },
      data: { status: "CONSUMED_CLOSED", chargeFlag: true },
    }),
    prisma.weekClose.create({ data: { isoWeek, closedBy: closedBy ?? null, charges } }),
  ]);
  return { ok: true, charges, totalCents };
}

export async function listWeekCloses(weeks: string[]): Promise<Map<string, { closedAt: Date; totalCents: number }>> {
  const rows = await prisma.weekClose.findMany({ where: { isoWeek: { in: weeks } } });
  const map = new Map<string, { closedAt: Date; totalCents: number }>();
  for (const r of rows) {
    const charges = (r.charges as PortfolioCharge[]) ?? [];
    map.set(r.isoWeek, { closedAt: r.closedAt, totalCents: charges.reduce((s, c) => s + c.totalCents, 0) });
  }
  return map;
}
