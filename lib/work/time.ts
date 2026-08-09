import { prisma } from "@/lib/prisma";
import { isoWeekOf } from "@/lib/work-taxonomy";

/**
 * Native time tracking — Pulse's own timesheet, the actuals source for the
 * Capacity module. Each entry is one person × engagement × day. Entries roll up
 * (engagement × resource × ISO week) into the matching CapacityBooking's
 * hoursConsumed, so the existing economics engine is unchanged.
 */

/**
 * Recompute a booking's consumed hours from the sum of its time entries for one
 * (engagement, resource, week). Creates a consumed-only booking when hours
 * appear with no prior booking; removes an empty consumed-only booking when the
 * last entry is deleted. Bookings with real bookedHours (Phase 2) are preserved.
 */
export async function recomputeConsumed(engagementId: string, resourceId: string, isoWeek: string): Promise<void> {
  const agg = await prisma.timeEntry.aggregate({
    where: { engagementId, resourceId, isoWeek },
    _sum: { hours: true },
  });
  const sum = Number(agg._sum.hours ?? 0);

  const existing = await prisma.capacityBooking.findUnique({
    where: { engagementId_resourceId_isoWeek: { engagementId, resourceId, isoWeek } },
  });

  if (sum <= 0) {
    if (existing) {
      if (Number(existing.hoursBooked) === 0) {
        await prisma.capacityBooking.delete({ where: { id: existing.id } });
      } else {
        await prisma.capacityBooking.update({ where: { id: existing.id }, data: { hoursConsumed: 0 } });
      }
    }
    return;
  }

  if (existing) {
    await prisma.capacityBooking.update({ where: { id: existing.id }, data: { hoursConsumed: sum } });
    return;
  }

  const resource = await prisma.poolResource.findUnique({ where: { id: resourceId }, select: { roleBandId: true } });
  const engagement = await prisma.portfolioEngagement.findUnique({ where: { id: engagementId }, select: { portfolioId: true } });
  if (!resource || !engagement) return;

  await prisma.capacityBooking.create({
    data: {
      engagementId,
      portfolioId: engagement.portfolioId,
      resourceId,
      roleBandId: resource.roleBandId,
      isoWeek,
      hoursBooked: 0,
      hoursConsumed: sum,
      status: "CONSUMED_CLOSED",
      unbookedConsumption: true,
    },
  });
}

export async function logTime(input: {
  resourceId: string;
  engagementId: string;
  workDate: string; // "YYYY-MM-DD"
  hours: number;
  notes?: string | null;
  billable?: boolean;
  createdBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [resource, engagement] = await Promise.all([
    prisma.poolResource.findUnique({ where: { id: input.resourceId }, select: { roleBandId: true } }),
    prisma.portfolioEngagement.findUnique({ where: { id: input.engagementId }, select: { portfolioId: true } }),
  ]);
  if (!resource) return { ok: false, error: "Resource not found" };
  if (!engagement) return { ok: false, error: "Engagement not found" };
  if (!(input.hours > 0)) return { ok: false, error: "Hours must be greater than zero" };

  const isoWeek = isoWeekOf(new Date(`${input.workDate}T00:00:00Z`));
  const entry = await prisma.timeEntry.create({
    data: {
      resourceId: input.resourceId,
      engagementId: input.engagementId,
      portfolioId: engagement.portfolioId,
      roleBandId: resource.roleBandId,
      workDate: new Date(`${input.workDate}T00:00:00Z`),
      isoWeek,
      hours: input.hours,
      notes: input.notes ?? null,
      billable: input.billable ?? true,
      createdBy: input.createdBy ?? null,
    },
  });
  await recomputeConsumed(input.engagementId, input.resourceId, isoWeek);
  return { ok: true, id: entry.id };
}

export async function deleteTimeEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = await prisma.timeEntry.findUnique({ where: { id } });
  if (!entry) return { ok: false, error: "Entry not found" };
  await prisma.timeEntry.delete({ where: { id } });
  await recomputeConsumed(entry.engagementId, entry.resourceId, entry.isoWeek);
  return { ok: true };
}

export type TimeEntryRow = {
  id: string;
  workDate: string;
  isoWeek: string;
  resource: string;
  engagement: string;
  portfolio: string;
  hours: number;
  billable: boolean;
  notes: string | null;
};

export async function listTimeEntries(filters: {
  resourceId?: string;
  engagementId?: string;
  isoWeek?: string;
  limit?: number;
}): Promise<{ rows: TimeEntryRow[]; totalHours: number }> {
  const where: Record<string, unknown> = {};
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.engagementId) where.engagementId = filters.engagementId;
  if (filters.isoWeek) where.isoWeek = filters.isoWeek;

  const [entries, agg] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: Math.min(filters.limit ?? 200, 500),
      include: {
        resource: { select: { personName: true } },
        engagement: { select: { clientName: true, portfolio: { select: { name: true } } } },
      },
    }),
    prisma.timeEntry.aggregate({ where, _sum: { hours: true } }),
  ]);

  return {
    rows: entries.map((e) => ({
      id: e.id,
      workDate: e.workDate.toISOString().slice(0, 10),
      isoWeek: e.isoWeek,
      resource: e.resource.personName,
      engagement: e.engagement.clientName,
      portfolio: e.engagement.portfolio.name,
      hours: Number(e.hours),
      billable: e.billable,
      notes: e.notes,
    })),
    totalHours: Number(agg._sum.hours ?? 0),
  };
}
