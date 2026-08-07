import type { CapacityBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isoWeekStart } from "@/lib/work-taxonomy";
import { rateForBandWeek } from "@/lib/work/capacity";

/**
 * Booking lifecycle (the hoteling board):
 *   requested → confirmed → (released | consumed_closed) ; also declined
 *
 * Rules (spec §3): request validates budget; confirm snapshots the rate and
 * enforces the weekly-capacity conflict; small low-utilization requests
 * auto-confirm; release before the cutoff returns capacity uncharged, after it
 * still charges as booked-unused. Closed weeks are immutable.
 */

const AUTO_CONFIRM_MAX_HOURS = 8;
const AUTO_CONFIRM_FREE_PCT = 0.25;

// ── Release cutoff: Wednesday 17:00 America/New_York of the PRIOR week ───────
/** Cutoff instant for a booking week (≈17:00 ET ≈ 21:00 UTC during EDT). */
export function releaseCutoff(isoWeek: string): Date {
  const monday = isoWeekStart(isoWeek);
  const c = new Date(monday);
  c.setUTCDate(monday.getUTCDate() - 5); // prior week's Wednesday
  c.setUTCHours(21, 0, 0, 0); // ~17:00 ET
  return c;
}
export function isPastCutoff(isoWeek: string, now: Date = new Date()): boolean {
  return now.getTime() > releaseCutoff(isoWeek).getTime();
}

export async function weekIsClosed(isoWeek: string): Promise<boolean> {
  return (await prisma.weekClose.count({ where: { isoWeek } })) > 0;
}

/** Confirmed booked hours for a resource in a week (capacity conflict basis). */
async function confirmedHours(resourceId: string, isoWeek: string, excludeId?: string): Promise<number> {
  const rows = await prisma.capacityBooking.findMany({
    where: { resourceId, isoWeek, status: "CONFIRMED", ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { hoursBooked: true },
  });
  return rows.reduce((s, r) => s + Number(r.hoursBooked), 0);
}

/** Remaining budget for an engagement × band = budget − already booked (requested+confirmed). */
async function remainingBudget(engagementId: string, roleBandId: string, excludeId?: string): Promise<number | null> {
  const budget = await prisma.engagementRoleBudget.findUnique({
    where: { engagementId_roleBandId: { engagementId, roleBandId } },
    select: { budgetedHours: true },
  });
  if (!budget) return null; // no budget line for this band
  const booked = await prisma.capacityBooking.findMany({
    where: { engagementId, roleBandId, status: { in: ["REQUESTED", "CONFIRMED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { hoursBooked: true },
  });
  return Number(budget.budgetedHours) - booked.reduce((s, r) => s + Number(r.hoursBooked), 0);
}

async function snapshotRateCents(resourceId: string, roleBandId: string, isoWeek: string): Promise<number> {
  const resource = await prisma.poolResource.findUnique({ where: { id: resourceId }, select: { costExempt: true } });
  if (resource?.costExempt) return 0; // directors: hours count, cost $0
  const r = await rateForBandWeek(roleBandId, isoWeek);
  return r?.loadedRateCents ?? 0;
}

export async function requestBooking(input: {
  engagementId: string;
  resourceId: string;
  isoWeek: string;
  hoursBooked: number;
  requestedBy?: string | null;
  overBudgetAck?: boolean;
}): Promise<{ ok: true; id: string; status: CapacityBookingStatus; note?: string } | { ok: false; error: string }> {
  if (!(input.hoursBooked > 0)) return { ok: false, error: "Hours must be greater than zero" };
  if (await weekIsClosed(input.isoWeek)) return { ok: false, error: "That week is closed." };

  const [engagement, resource] = await Promise.all([
    prisma.portfolioEngagement.findUnique({ where: { id: input.engagementId }, select: { portfolioId: true, status: true } }),
    prisma.poolResource.findUnique({ where: { id: input.resourceId }, select: { roleBandId: true, weeklyCapacityHours: true, active: true } }),
  ]);
  if (!engagement) return { ok: false, error: "Engagement not found" };
  if (engagement.status === "complete") return { ok: false, error: "Engagement is complete — reopen it to book." };
  if (!resource || !resource.active) return { ok: false, error: "Resource not found or inactive" };

  // Budget guard (soft): over budget is allowed only with an explicit ack.
  const remaining = await remainingBudget(input.engagementId, resource.roleBandId);
  let note: string | undefined;
  if (remaining != null && input.hoursBooked > remaining) {
    if (!input.overBudgetAck) {
      return { ok: false, error: `Only ${remaining}h left in this band's budget. Re-submit with "over budget" acknowledged to proceed.` };
    }
    note = "over budget";
  }

  const existing = await prisma.capacityBooking.findUnique({
    where: { engagementId_resourceId_isoWeek: { engagementId: input.engagementId, resourceId: input.resourceId, isoWeek: input.isoWeek } },
  });
  if (existing && Number(existing.hoursBooked) > 0) {
    return { ok: false, error: "A booking for this resource + engagement + week already exists — edit it instead." };
  }

  // Auto-confirm small, low-utilization requests; else queue as requested.
  const capacity = Number(resource.weeklyCapacityHours);
  const confirmed = await confirmedHours(input.resourceId, input.isoWeek);
  const free = capacity - confirmed;
  const autoConfirm =
    input.hoursBooked <= AUTO_CONFIRM_MAX_HOURS &&
    free >= AUTO_CONFIRM_FREE_PCT * capacity &&
    confirmed + input.hoursBooked <= capacity;

  const status: CapacityBookingStatus = autoConfirm ? "CONFIRMED" : "REQUESTED";
  const rateCentsSnapshot = autoConfirm ? await snapshotRateCents(input.resourceId, resource.roleBandId, input.isoWeek) : null;

  const booking = await prisma.capacityBooking.upsert({
    where: { engagementId_resourceId_isoWeek: { engagementId: input.engagementId, resourceId: input.resourceId, isoWeek: input.isoWeek } },
    update: {
      hoursBooked: input.hoursBooked,
      status,
      rateCentsSnapshot,
      overBudgetAck: !!input.overBudgetAck,
      unbookedConsumption: false,
      requestedBy: input.requestedBy ?? null,
      confirmedBy: autoConfirm ? "auto" : null,
      releasedAt: null,
      chargeFlag: false,
    },
    create: {
      engagementId: input.engagementId,
      portfolioId: engagement.portfolioId,
      resourceId: input.resourceId,
      roleBandId: resource.roleBandId,
      isoWeek: input.isoWeek,
      hoursBooked: input.hoursBooked,
      status,
      rateCentsSnapshot,
      overBudgetAck: !!input.overBudgetAck,
      requestedBy: input.requestedBy ?? null,
      confirmedBy: autoConfirm ? "auto" : null,
    },
  });
  return { ok: true, id: booking.id, status, note: autoConfirm ? `auto-confirmed${note ? ` (${note})` : ""}` : note };
}

export async function confirmBooking(id: string, confirmedBy?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.capacityBooking.findUnique({ where: { id }, include: { resource: { select: { weeklyCapacityHours: true } } } });
  if (!b) return { ok: false, error: "Booking not found" };
  if (b.status !== "REQUESTED") return { ok: false, error: "Only requested bookings can be confirmed." };
  if (await weekIsClosed(b.isoWeek)) return { ok: false, error: "That week is closed." };

  const capacity = Number(b.resource.weeklyCapacityHours);
  const confirmed = await confirmedHours(b.resourceId, b.isoWeek, id);
  if (confirmed + Number(b.hoursBooked) > capacity) {
    return { ok: false, error: `Overbooks ${b.resourceId ? "the resource" : ""}: ${confirmed}h confirmed + ${Number(b.hoursBooked)}h > ${capacity}h capacity.` };
  }
  const rateCentsSnapshot = await snapshotRateCents(b.resourceId, b.roleBandId, b.isoWeek);
  await prisma.capacityBooking.update({ where: { id }, data: { status: "CONFIRMED", confirmedBy: confirmedBy ?? null, rateCentsSnapshot } });
  return { ok: true };
}

export async function declineBooking(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.capacityBooking.findUnique({ where: { id }, select: { status: true } });
  if (!b) return { ok: false, error: "Booking not found" };
  if (b.status !== "REQUESTED") return { ok: false, error: "Only requested bookings can be declined." };
  await prisma.capacityBooking.update({ where: { id }, data: { status: "DECLINED" } });
  return { ok: true };
}

export async function releaseBooking(id: string): Promise<{ ok: true; charged: boolean } | { ok: false; error: string }> {
  const b = await prisma.capacityBooking.findUnique({ where: { id }, select: { status: true, isoWeek: true } });
  if (!b) return { ok: false, error: "Booking not found" };
  if (b.status !== "CONFIRMED") return { ok: false, error: "Only confirmed bookings can be released." };
  if (await weekIsClosed(b.isoWeek)) return { ok: false, error: "That week is closed." };

  if (isPastCutoff(b.isoWeek)) {
    // Past cutoff — the booking still charges (booked-unused) at week close.
    await prisma.capacityBooking.update({ where: { id }, data: { chargeFlag: true } });
    return { ok: true, charged: true };
  }
  await prisma.capacityBooking.update({ where: { id }, data: { status: "RELEASED", releasedAt: new Date(), chargeFlag: false } });
  return { ok: true, charged: false };
}

export async function editBookingHours(id: string, hours: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(hours > 0)) return { ok: false, error: "Hours must be greater than zero" };
  const b = await prisma.capacityBooking.findUnique({ where: { id }, select: { status: true, isoWeek: true } });
  if (!b) return { ok: false, error: "Booking not found" };
  if (b.status !== "REQUESTED" && b.status !== "CONFIRMED") return { ok: false, error: "Only requested/confirmed bookings can be edited." };
  if (await weekIsClosed(b.isoWeek)) return { ok: false, error: "That week is closed." };
  await prisma.capacityBooking.update({ where: { id }, data: { hoursBooked: hours } });
  return { ok: true };
}

// ── Grid + queue reads ──────────────────────────────────────────────────────

export type GridCell = { confirmed: number; requested: number; consumed: number };
export type GridResource = { id: string; name: string; band: string; capacity: number; costExempt: boolean };
export type GridBooking = {
  id: string;
  resourceId: string;
  isoWeek: string;
  engagement: string;
  portfolio: string;
  hoursBooked: number;
  hoursConsumed: number;
  status: CapacityBookingStatus;
  chargeFlag: boolean;
};

export async function capacityGrid(weeks: string[]): Promise<{
  resources: GridResource[];
  weeks: string[];
  cells: Record<string, GridCell>; // key `${resourceId}|${isoWeek}`
  bookings: GridBooking[];
  closedWeeks: string[];
}> {
  const [resources, bookings, closes] = await Promise.all([
    prisma.poolResource.findMany({ where: { active: true }, orderBy: { personName: "asc" }, include: { roleBand: true } }),
    prisma.capacityBooking.findMany({
      where: { isoWeek: { in: weeks }, status: { notIn: ["DECLINED", "RELEASED"] } },
      include: {
        roleBand: { select: { name: true } },
        engagement: { select: { clientName: true, portfolio: { select: { name: true } } } },
      },
    }),
    prisma.weekClose.findMany({ where: { isoWeek: { in: weeks } }, select: { isoWeek: true } }),
  ]);

  const cells: Record<string, GridCell> = {};
  const gridBookings: GridBooking[] = [];
  for (const b of bookings) {
    const key = `${b.resourceId}|${b.isoWeek}`;
    const cell = (cells[key] ??= { confirmed: 0, requested: 0, consumed: 0 });
    const booked = Number(b.hoursBooked);
    const consumed = Number(b.hoursConsumed);
    if (b.status === "REQUESTED") cell.requested += booked;
    else cell.confirmed += booked; // CONFIRMED or CONSUMED_CLOSED
    cell.consumed += consumed;
    gridBookings.push({
      id: b.id,
      resourceId: b.resourceId,
      isoWeek: b.isoWeek,
      engagement: b.engagement.clientName,
      portfolio: b.engagement.portfolio.name,
      hoursBooked: booked,
      hoursConsumed: consumed,
      status: b.status,
      chargeFlag: b.chargeFlag,
    });
  }

  return {
    resources: resources.map((r) => ({ id: r.id, name: r.personName, band: r.roleBand.name, capacity: Number(r.weeklyCapacityHours), costExempt: r.costExempt })),
    weeks,
    cells,
    bookings: gridBookings,
    closedWeeks: closes.map((c) => c.isoWeek),
  };
}

export type PendingRequest = {
  id: string;
  resource: string;
  isoWeek: string;
  engagement: string;
  portfolio: string;
  band: string;
  hours: number;
  overBudgetAck: boolean;
  wouldOverbook: boolean;
  capacity: number;
  confirmed: number;
};

export async function pendingRequests(): Promise<PendingRequest[]> {
  const rows = await prisma.capacityBooking.findMany({
    where: { status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    include: {
      resource: { select: { personName: true, weeklyCapacityHours: true } },
      roleBand: { select: { name: true } },
      engagement: { select: { clientName: true, portfolio: { select: { name: true } } } },
    },
  });
  const out: PendingRequest[] = [];
  for (const b of rows) {
    const confirmed = await confirmedHours(b.resourceId, b.isoWeek, b.id);
    const capacity = Number(b.resource.weeklyCapacityHours);
    out.push({
      id: b.id,
      resource: b.resource.personName,
      isoWeek: b.isoWeek,
      engagement: b.engagement.clientName,
      portfolio: b.engagement.portfolio.name,
      band: b.roleBand.name,
      hours: Number(b.hoursBooked),
      overBudgetAck: b.overBudgetAck,
      wouldOverbook: confirmed + Number(b.hoursBooked) > capacity,
      capacity,
      confirmed,
    });
  }
  return out;
}

export async function pendingCount(): Promise<number> {
  return prisma.capacityBooking.count({ where: { status: "REQUESTED" } });
}
