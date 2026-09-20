import { prisma } from "@/lib/prisma";
import { upcomingWeeks } from "@/lib/work-taxonomy";

/**
 * Pool health metrics (spec §8): forward bench (hiring trigger) and trailing
 * utilization per resource, plus an unbooked-consumption count.
 */

const BENCH_ALERT_PCT = 0.1; // sustained < 10% bench → stand up the next book
const BENCH_ALERT_WEEKS = 6;

export type PoolMetrics = {
  weeks: { isoWeek: string; capacity: number; confirmed: number; bench: number; benchPct: number | null }[];
  resources: { id: string; name: string; band: string; capacity: number; trailingConsumed: number; utilPct: number | null }[];
  unbookedCount: number;
  benchAlert: boolean;
};

export async function poolMetrics(): Promise<PoolMetrics> {
  const forward = upcomingWeeks(8);
  const trailing = upcomingWeeks(8, new Date(Date.now() - 7 * 7 * 86400000));
  const allWeeks = Array.from(new Set([...forward, ...trailing]));

  const [resources, bookings, unbookedCount] = await Promise.all([
    prisma.poolResource.findMany({ where: { active: true }, orderBy: { personName: "asc" }, include: { roleBand: true } }),
    prisma.capacityBooking.findMany({
      where: { isoWeek: { in: allWeeks }, status: { notIn: ["DECLINED", "RELEASED"] } },
      select: { resourceId: true, isoWeek: true, status: true, hoursBooked: true, hoursConsumed: true },
    }),
    prisma.capacityBooking.count({ where: { unbookedConsumption: true, isoWeek: { in: trailing } } }),
  ]);

  const totalCapacity = resources.reduce((s, r) => s + Number(r.weeklyCapacityHours), 0);

  // Forward bench: capacity − confirmed booked, per week.
  const confirmedByWeek = new Map<string, number>();
  const consumedTrailingByResource = new Map<string, number>();
  const trailingSet = new Set(trailing);
  for (const b of bookings) {
    if (b.status === "CONFIRMED" || b.status === "CONSUMED_CLOSED") {
      confirmedByWeek.set(b.isoWeek, (confirmedByWeek.get(b.isoWeek) ?? 0) + Number(b.hoursBooked));
    }
    if (trailingSet.has(b.isoWeek)) {
      consumedTrailingByResource.set(b.resourceId, (consumedTrailingByResource.get(b.resourceId) ?? 0) + Number(b.hoursConsumed));
    }
  }

  const weeks = forward.map((w) => {
    const confirmed = confirmedByWeek.get(w) ?? 0;
    const bench = totalCapacity - confirmed;
    return { isoWeek: w, capacity: totalCapacity, confirmed, bench, benchPct: totalCapacity > 0 ? bench / totalCapacity : null };
  });

  const resourceRows = resources.map((r) => {
    const cap = Number(r.weeklyCapacityHours);
    const consumed = consumedTrailingByResource.get(r.id) ?? 0;
    const denom = cap * trailing.length;
    return {
      id: r.id,
      name: r.personName,
      band: r.roleBand.name,
      capacity: cap,
      trailingConsumed: consumed,
      utilPct: denom > 0 ? consumed / denom : null,
    };
  });

  // Hiring trigger: bench under 10% for the first BENCH_ALERT_WEEKS forward weeks.
  const benchAlert =
    weeks.length >= BENCH_ALERT_WEEKS &&
    weeks.slice(0, BENCH_ALERT_WEEKS).every((w) => w.benchPct != null && w.benchPct < BENCH_ALERT_PCT);

  return { weeks, resources: resourceRows, unbookedCount, benchAlert };
}
