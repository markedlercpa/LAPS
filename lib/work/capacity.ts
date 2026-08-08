import { prisma } from "@/lib/prisma";
import { ROLE_BAND_SEED, isoWeekStart } from "@/lib/work-taxonomy";

/**
 * Capacity module — the Phase 1 ledger. Role bands + effective-dated rates,
 * pool resources, portfolios, portfolio engagements + per-band hour budgets,
 * and the engagement-economics rollup (budget vs booked vs consumed by band).
 */

let bandsSeeded = false;

/** Lazily seed the standard role bands (idempotent, by name). */
export async function ensureRoleBandsSeeded(): Promise<void> {
  if (bandsSeeded) return;
  const count = await prisma.roleBand.count();
  if (count === 0) {
    for (const b of ROLE_BAND_SEED) {
      await prisma.roleBand.create({
        data: { name: b.name, targetUtilization: b.targetUtilization, sortOrder: b.sortOrder },
      });
    }
  }
  bandsSeeded = true;
}

export async function listRoleBands() {
  await ensureRoleBandsSeeded();
  return prisma.roleBand.findMany({ orderBy: { sortOrder: "asc" }, include: { rates: { orderBy: { effectiveFrom: "desc" } } } });
}

/**
 * The loaded/bill rate in effect for a band on a given ISO week — the latest
 * RoleBandRate row with effectiveFrom on or before the week's Monday. Returns
 * null when the band has no rate yet (charging falls back to 0 with a flag).
 */
export async function rateForBandWeek(roleBandId: string, isoWeek: string) {
  const weekStart = isoWeekStart(isoWeek);
  return prisma.roleBandRate.findFirst({
    where: { roleBandId, effectiveFrom: { lte: weekStart } },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Add a new effective-dated rate for a band (never mutates history). */
export async function addRoleBandRate(input: {
  roleBandId: string;
  loadedRateCents: number;
  billRateCents?: number | null;
  effectiveFrom: string; // ISO date
  fiscalYear?: number | null;
  note?: string | null;
}) {
  return prisma.roleBandRate.upsert({
    where: { roleBandId_effectiveFrom: { roleBandId: input.roleBandId, effectiveFrom: new Date(input.effectiveFrom) } },
    update: { loadedRateCents: input.loadedRateCents, billRateCents: input.billRateCents ?? null, fiscalYear: input.fiscalYear ?? null, note: input.note ?? null },
    create: {
      roleBandId: input.roleBandId,
      loadedRateCents: input.loadedRateCents,
      billRateCents: input.billRateCents ?? null,
      fiscalYear: input.fiscalYear ?? null,
      effectiveFrom: new Date(input.effectiveFrom),
      note: input.note ?? null,
    },
  });
}

/**
 * Loaded-rate derivation (admin helper, not used at charge time). Returns the
 * hourly loaded rate in cents from fully-loaded annual cost and capacity.
 *   loaded = annualLoadedCost ÷ (weeklyCapacity × 46 productive weeks × utilization)
 */
export function deriveLoadedRateCents(input: {
  annualLoadedCostCents: number;
  weeklyCapacityHours: number;
  targetUtilization: number;
  productiveWeeks?: number;
}): number {
  const weeks = input.productiveWeeks ?? 46;
  const billableHours = input.weeklyCapacityHours * weeks * input.targetUtilization;
  if (billableHours <= 0) return 0;
  return Math.round(input.annualLoadedCostCents / billableHours);
}

// ── Resources / portfolios / engagements CRUD ───────────────────────────────

export async function createResource(input: {
  personName: string;
  email: string;
  roleBandId: string;
  weeklyCapacityHours?: number;
  skillTags?: string[];
  location?: string | null;
  costExempt?: boolean;
  createdBy?: string | null;
}) {
  return prisma.poolResource.create({
    data: {
      personName: input.personName,
      email: input.email.toLowerCase(),
      roleBandId: input.roleBandId,
      weeklyCapacityHours: input.weeklyCapacityHours ?? 40,
      skillTags: input.skillTags ?? [],
      location: input.location ?? null,
      costExempt: input.costExempt ?? false,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function createPortfolio(input: {
  name: string;
  fiscalYear?: number | null;
  directorName: string;
  directorEmail: string;
  directorCostCentsAnnual?: number;
  declaredPortfolioRevenueCents?: number;
  gpTargetPct?: number;
  createdBy?: string | null;
}) {
  return prisma.portfolio.create({
    data: {
      name: input.name,
      fiscalYear: input.fiscalYear ?? null,
      directorName: input.directorName,
      directorEmail: input.directorEmail.toLowerCase(),
      directorCostCentsAnnual: input.directorCostCentsAnnual ?? 0,
      declaredPortfolioRevenueCents: input.declaredPortfolioRevenueCents ?? 0,
      gpTargetPct: input.gpTargetPct ?? 0.5,
      createdBy: input.createdBy ?? null,
    },
  });
}

/**
 * Bulk-import pool resources from a parsed roster (e.g. a Karbon export). Maps
 * each row's band name to an existing RoleBand (case-insensitive); rows whose
 * band can't be matched are skipped and reported. Existing resources (by email)
 * are updated, not duplicated. No Karbon connection — this is a manual import.
 */
export async function bulkImportResources(
  rows: { personName: string; email: string; bandName: string; weeklyCapacityHours?: number; location?: string | null; costExempt?: boolean }[],
  createdBy?: string | null,
): Promise<{ created: number; updated: number; skipped: string[] }> {
  const bands = await prisma.roleBand.findMany({ select: { id: true, name: true } });
  const bandByName = new Map(bands.map((b) => [b.name.toLowerCase(), b.id]));

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const r of rows) {
    const bandId = bandByName.get(r.bandName.trim().toLowerCase());
    if (!bandId || !r.email || !r.personName) {
      skipped.push(`${r.personName || r.email || "?"}${bandId ? "" : ` (unknown band "${r.bandName}")`}`);
      continue;
    }
    const existing = await prisma.poolResource.findUnique({ where: { email: r.email.toLowerCase() }, select: { id: true } });
    const data = {
      personName: r.personName,
      roleBandId: bandId,
      weeklyCapacityHours: r.weeklyCapacityHours ?? 40,
      location: r.location ?? null,
      costExempt: r.costExempt ?? false,
    };
    if (existing) {
      await prisma.poolResource.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.poolResource.create({ data: { ...data, email: r.email.toLowerCase(), createdBy: createdBy ?? null } });
      created += 1;
    }
  }
  return { created, updated, skipped };
}

export async function createEngagement(input: {
  portfolioId: string;
  clientName: string;
  engagementType?: string;
  revenueCents?: number;
  revenueRecognition?: string;
  startWeek?: string | null;
  endWeek?: string | null;
  createdBy?: string | null;
}) {
  return prisma.portfolioEngagement.create({
    data: {
      portfolioId: input.portfolioId,
      clientName: input.clientName,
      engagementType: input.engagementType ?? "other",
      revenueCents: input.revenueCents ?? 0,
      revenueRecognition: input.revenueRecognition ?? "pct_hours",
      startWeek: input.startWeek ?? null,
      endWeek: input.endWeek ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

/** Replace an engagement's per-band hour budget (drops zero rows). */
export async function replaceEngagementBudget(
  engagementId: string,
  rows: { roleBandId: string; budgetedHours: number }[],
) {
  await prisma.$transaction([
    prisma.engagementRoleBudget.deleteMany({ where: { engagementId } }),
    ...(rows.length
      ? [
          prisma.engagementRoleBudget.createMany({
            data: rows
              .filter((r) => r.budgetedHours > 0)
              .map((r) => ({ engagementId, roleBandId: r.roleBandId, budgetedHours: r.budgetedHours })),
          }),
        ]
      : []),
  ]);
  return { ok: true as const, saved: rows.filter((r) => r.budgetedHours > 0).length };
}

// ── Engagement economics (budget vs booked vs consumed by band) ─────────────

export type BandLine = {
  roleBandId: string;
  band: string;
  budgetedHours: number;
  bookedHours: number;
  consumedHours: number;
  consumedCostCents: number; // consumed hours × effective rate for that band, per week
};

export type EngagementEconomics = {
  engagementId: string;
  clientName: string;
  revenueCents: number; // contract value
  revenueRecognition: string;
  pctComplete: number | null; // consumed ÷ budgeted, capped at 1
  recognizedRevenueCents: number; // contract × pctComplete (% completion)
  lines: BandLine[];
  totals: { budgeted: number; booked: number; consumed: number; consumedCostCents: number };
  grossProfitCents: number; // recognized revenue − consumed cost
  realizedRateCents: number | null; // contract ÷ consumed hours (per hour)
  burnPct: number | null; // consumed ÷ budgeted
  overBudget: boolean;
};

/**
 * Roll up an engagement's economics. Consumed cost uses each booking's
 * snapshotted rate when present, else the band rate effective for that week
 * (so Phase-1 consumed-only rows still cost out correctly).
 */
export async function engagementEconomics(engagementId: string): Promise<EngagementEconomics | null> {
  const eng = await prisma.portfolioEngagement.findUnique({
    where: { id: engagementId },
    include: {
      budgets: { include: { roleBand: true } },
      bookings: { include: { roleBand: true, resource: { select: { costExempt: true } } } },
    },
  });
  if (!eng) return null;

  const bandMap = new Map<string, BandLine>();
  const ensure = (roleBandId: string, band: string): BandLine => {
    let l = bandMap.get(roleBandId);
    if (!l) {
      l = { roleBandId, band, budgetedHours: 0, bookedHours: 0, consumedHours: 0, consumedCostCents: 0 };
      bandMap.set(roleBandId, l);
    }
    return l;
  };

  for (const b of eng.budgets) ensure(b.roleBandId, b.roleBand.name).budgetedHours += Number(b.budgetedHours);

  // Resolve rates per (band, week) once, caching lookups.
  const rateCache = new Map<string, number>();
  for (const bk of eng.bookings) {
    const line = ensure(bk.roleBandId, bk.roleBand.name);
    const booked = Number(bk.hoursBooked);
    const consumed = Number(bk.hoursConsumed);
    line.bookedHours += booked;
    line.consumedHours += consumed;

    // Cost-exempt resources (directors) count hours but cost $0 — their comp is
    // carried as the portfolio's director-cost line, not per-hour labor.
    let rate = 0;
    if (!bk.resource.costExempt) {
      rate = bk.rateCentsSnapshot ?? -1;
      if (rate < 0) {
        const key = `${bk.roleBandId}|${bk.isoWeek}`;
        if (rateCache.has(key)) rate = rateCache.get(key)!;
        else {
          const r = await rateForBandWeek(bk.roleBandId, bk.isoWeek);
          rate = r?.loadedRateCents ?? 0;
          rateCache.set(key, rate);
        }
      }
    }
    line.consumedCostCents += Math.round(consumed * rate);
  }

  const lines = Array.from(bandMap.values()).sort((a, z) => a.band.localeCompare(z.band));
  const totals = lines.reduce(
    (t, l) => {
      t.budgeted += l.budgetedHours;
      t.booked += l.bookedHours;
      t.consumed += l.consumedHours;
      t.consumedCostCents += l.consumedCostCents;
      return t;
    },
    { budgeted: 0, booked: 0, consumed: 0, consumedCostCents: 0 },
  );

  const burnPct = totals.budgeted > 0 ? totals.consumed / totals.budgeted : null;
  // % completion revenue recognition (firm policy): recognize contract value in
  // proportion to hours consumed vs. budgeted, capped at 100%. Needs a budget to
  // compute; with none, nothing is recognized yet.
  const pctComplete = burnPct != null ? Math.min(1, burnPct) : null;
  const recognizedRevenueCents = pctComplete != null ? Math.round(eng.revenueCents * pctComplete) : 0;
  const grossProfitCents = recognizedRevenueCents - totals.consumedCostCents;
  const realizedRateCents = totals.consumed > 0 ? Math.round(eng.revenueCents / totals.consumed) : null;

  return {
    engagementId: eng.id,
    clientName: eng.clientName,
    revenueCents: eng.revenueCents,
    revenueRecognition: eng.revenueRecognition,
    pctComplete,
    recognizedRevenueCents,
    lines,
    totals,
    grossProfitCents,
    realizedRateCents,
    burnPct,
    overBudget: totals.budgeted > 0 && totals.consumed > totals.budgeted,
  };
}

// ── Director economics (par bonus = share of declared revenue) ──────────────

export type DirectorEconomics = {
  declaredRevenueCents: number;
  baseCents: number;
  basePct: number | null; // base ÷ declared revenue
  parBonusCents: number; // declared revenue × parBonusPct
  parBonusPct: number;
  onTargetCents: number; // base + par bonus
  onTargetPct: number | null; // (base + par) ÷ declared revenue
};

/** Compute a portfolio director's base/par/on-target economics. Pure. */
export function directorEconomics(p: {
  declaredPortfolioRevenueCents: number;
  directorCostCentsAnnual: number;
  parBonusPct: number;
}): DirectorEconomics {
  const declared = p.declaredPortfolioRevenueCents;
  const parBonusCents = Math.round(declared * p.parBonusPct);
  const onTargetCents = p.directorCostCentsAnnual + parBonusCents;
  return {
    declaredRevenueCents: declared,
    baseCents: p.directorCostCentsAnnual,
    basePct: declared > 0 ? p.directorCostCentsAnnual / declared : null,
    parBonusCents,
    parBonusPct: p.parBonusPct,
    onTargetCents,
    onTargetPct: declared > 0 ? onTargetCents / declared : null,
  };
}
