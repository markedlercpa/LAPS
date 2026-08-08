import { prisma } from "@/lib/prisma";
import { isoWeekOf, isoWeekStart } from "@/lib/work-taxonomy";
import { rateForBandWeek } from "@/lib/work/capacity";
import { buildStatement, availableMonths } from "@/lib/pace/statements";

/**
 * Cash forecasting — 13-week (weekly) and 12-month (monthly) models, firm-level,
 * off data internal to Pulse:
 *   Inflows  = signed/won proposal payment schedules (ProposalPayment.dueOn)
 *   Outflows = committed capacity labor (booked hours × loaded rate) + director
 *              base (annual, prorated) + manual OUTFLOW lines
 *   ± manual lines of either direction (rent, debt service, taxes, draws, …)
 * Beginning cash rolls to ending each bucket; endings under the min-cash buffer
 * are flagged.
 */

export type Mode = "weekly" | "monthly";

export type Bucket = { key: string; label: string; start: Date; end: Date };
export type ForecastRow = {
  key: string;
  label: string;
  beginningCents: number;
  inflowCents: number;
  outflowCents: number;
  endingCents: number;
  breach: boolean;
  sources: { proposalsCents: number; manualInCents: number; laborCents: number; directorCents: number; manualOutCents: number };
};
export type Forecast = {
  mode: Mode;
  openingCents: number;
  minCashCents: number;
  rows: ForecastRow[];
  totals: { inflowCents: number; outflowCents: number; endingCents: number };
  lowestEndingCents: number;
  firstBreachKey: string | null;
};

// ── Bucket builders ──────────────────────────────────────────────────────────
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function addMonths(d: Date, k: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m + k));
  return new Date(Date.UTC(y, m + k, day));
}

function weeklyBuckets(n: number): Bucket[] {
  const start = isoWeekStart(isoWeekOf(new Date()));
  return Array.from({ length: n }, (_, i) => {
    const s = new Date(start);
    s.setUTCDate(start.getUTCDate() + i * 7);
    const e = new Date(s);
    e.setUTCDate(s.getUTCDate() + 6);
    return { key: isoWeekOf(s), label: isoWeekOf(s).replace(/^\d{4}-/, ""), start: s, end: e };
  });
}
function monthlyBuckets(n: number): Bucket[] {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: n }, (_, i) => {
    const s = addMonths(first, i);
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
    const key = `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: s.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), start: s, end: e };
  });
}

function bucketIndexForDate(buckets: Bucket[], d: Date): number {
  const t = d.getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t <= buckets[i].end.getTime() + 86_399_000) return i;
  }
  return -1;
}

// ── Manual line occurrence expansion ────────────────────────────────────────
type LineRow = { kind: "INFLOW" | "OUTFLOW"; amountCents: number; cadence: string; startDate: Date; endDate: Date | null };

function occurrences(line: LineRow, horizonStart: Date, horizonEnd: Date): Date[] {
  const out: Date[] = [];
  const end = line.endDate && line.endDate.getTime() < horizonEnd.getTime() ? line.endDate : horizonEnd;
  if (line.cadence === "ONE_TIME") {
    if (line.startDate >= horizonStart && line.startDate <= horizonEnd) out.push(line.startDate);
    return out;
  }
  const stepDays = line.cadence === "WEEKLY" ? 7 : line.cadence === "BIWEEKLY" ? 14 : 0;
  let cur = new Date(line.startDate);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard++ < 800) {
    if (cur >= horizonStart) out.push(new Date(cur));
    cur = stepDays ? new Date(cur.getTime() + stepDays * 86_400_000) : addMonths(cur, 1);
  }
  return out;
}

// ── The forecast ─────────────────────────────────────────────────────────────
export async function buildForecast(mode: Mode): Promise<Forecast> {
  const buckets = mode === "weekly" ? weeklyBuckets(13) : monthlyBuckets(12);
  const h0 = buckets[0].start;
  const hN = buckets[buckets.length - 1].end;
  const n = buckets.length;

  const zero = () => new Array(n).fill(0);
  const proposalsCents = zero();
  const manualInCents = zero();
  const laborCents = zero();
  const directorCents = zero();
  const manualOutCents = zero();

  const [position, lines, payments, bookings, portfolios] = await Promise.all([
    prisma.cashPosition.findUnique({ where: { scope: "firm" } }),
    prisma.cashFlowLine.findMany({ where: { active: true } }),
    prisma.proposalPayment.findMany({
      where: { proposal: { status: { in: ["SIGNED", "WON"] } }, dueOn: { not: null } },
      select: { amount: true, dueOn: true },
    }),
    prisma.capacityBooking.findMany({
      where: {
        status: { in: ["CONFIRMED", "CONSUMED_CLOSED"] },
        ...(mode === "weekly" ? { isoWeek: { in: buckets.map((b) => b.key) } } : {}),
      },
      include: { resource: { select: { costExempt: true } } },
    }),
    prisma.portfolio.findMany({ where: { active: true }, select: { directorCostCentsAnnual: true } }),
  ]);

  // Manual lines.
  for (const l of lines) {
    const occ = occurrences(
      { kind: l.kind, amountCents: l.amountCents, cadence: l.cadence, startDate: l.startDate, endDate: l.endDate },
      h0,
      hN,
    );
    for (const d of occ) {
      const i = bucketIndexForDate(buckets, d);
      if (i < 0) continue;
      if (l.kind === "INFLOW") manualInCents[i] += l.amountCents;
      else manualOutCents[i] += l.amountCents;
    }
  }

  // Proposal scheduled payments (inflow).
  for (const p of payments) {
    if (!p.dueOn) continue;
    const d = new Date(`${p.dueOn.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const i = bucketIndexForDate(buckets, d);
    if (i < 0) continue;
    proposalsCents[i] += Math.round(Number(p.amount) * 100);
  }

  // Committed capacity labor (booked hours × loaded rate; directors $0).
  const rateCache = new Map<string, number>();
  for (const b of bookings) {
    const booked = Number(b.hoursBooked);
    if (booked <= 0 || b.resource.costExempt) continue;
    // Map the booking's week to a bucket by its Monday date.
    const monday = isoWeekStart(b.isoWeek);
    const i = bucketIndexForDate(buckets, monday);
    if (i < 0) continue;
    let rate = b.rateCentsSnapshot ?? -1;
    if (rate < 0) {
      const key = `${b.roleBandId}|${b.isoWeek}`;
      if (rateCache.has(key)) rate = rateCache.get(key)!;
      else {
        const r = await rateForBandWeek(b.roleBandId, b.isoWeek);
        rate = r?.loadedRateCents ?? 0;
        rateCache.set(key, rate);
      }
    }
    laborCents[i] += Math.round(booked * rate);
  }

  // Director base — annual, prorated per bucket (÷52 weekly, ÷12 monthly).
  const directorAnnual = portfolios.reduce((s, p) => s + p.directorCostCentsAnnual, 0);
  const perBucketDirector = mode === "weekly" ? Math.round(directorAnnual / 52) : Math.round(directorAnnual / 12);
  for (let i = 0; i < n; i++) directorCents[i] = perBucketDirector;

  // Roll.
  const openingCents = position?.openingCents ?? 0;
  const minCashCents = position?.minCashCents ?? 0;
  const rows: ForecastRow[] = [];
  let running = openingCents;
  let lowestEnding = Infinity;
  let firstBreachKey: string | null = null;
  for (let i = 0; i < n; i++) {
    const beginning = running;
    const inflow = proposalsCents[i] + manualInCents[i];
    const outflow = laborCents[i] + directorCents[i] + manualOutCents[i];
    const ending = beginning + inflow - outflow;
    running = ending;
    const breach = ending < minCashCents;
    if (breach && firstBreachKey == null) firstBreachKey = buckets[i].key;
    lowestEnding = Math.min(lowestEnding, ending);
    rows.push({
      key: buckets[i].key,
      label: buckets[i].label,
      beginningCents: beginning,
      inflowCents: inflow,
      outflowCents: outflow,
      endingCents: ending,
      breach,
      sources: {
        proposalsCents: proposalsCents[i],
        manualInCents: manualInCents[i],
        laborCents: laborCents[i],
        directorCents: directorCents[i],
        manualOutCents: manualOutCents[i],
      },
    });
  }

  return {
    mode,
    openingCents,
    minCashCents,
    rows,
    totals: {
      inflowCents: rows.reduce((s, r) => s + r.inflowCents, 0),
      outflowCents: rows.reduce((s, r) => s + r.outflowCents, 0),
      endingCents: rows.length ? rows[rows.length - 1].endingCents : openingCents,
    },
    lowestEndingCents: rows.length ? lowestEnding : openingCents,
    firstBreachKey,
  };
}

// ── Config + lines CRUD ──────────────────────────────────────────────────────
export async function getCashPosition() {
  return prisma.cashPosition.findUnique({ where: { scope: "firm" } });
}

export async function setCashPosition(input: { openingCents: number; openingAsOf: string; minCashCents: number }) {
  return prisma.cashPosition.upsert({
    where: { scope: "firm" },
    update: { openingCents: input.openingCents, openingAsOf: new Date(input.openingAsOf), minCashCents: input.minCashCents },
    create: { scope: "firm", openingCents: input.openingCents, openingAsOf: new Date(input.openingAsOf), minCashCents: input.minCashCents },
  });
}

/** Best-effort opening seed: consolidated cash from the latest balance sheet. */
export async function latestCashActualCents(): Promise<number | null> {
  const months = await availableMonths();
  if (months.length === 0) return null;
  const bs = await buildStatement(null, months[0], "BS");
  const cash = bs.lines.find((l) => l.code === "1000");
  return cash ? Math.round(cash.amount * 100) : null;
}

export async function listCashLines() {
  return prisma.cashFlowLine.findMany({ orderBy: [{ active: "desc" }, { startDate: "asc" }] });
}

export async function addCashLine(input: {
  label: string;
  kind: "INFLOW" | "OUTFLOW";
  amountCents: number;
  cadence: "ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate?: string | null;
  category?: string | null;
  createdBy?: string | null;
}) {
  return prisma.cashFlowLine.create({
    data: {
      label: input.label,
      kind: input.kind,
      amountCents: input.amountCents,
      cadence: input.cadence,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      category: input.category ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function deleteCashLine(id: string) {
  await prisma.cashFlowLine.delete({ where: { id } });
  return { ok: true as const };
}
