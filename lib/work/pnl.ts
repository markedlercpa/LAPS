import { prisma } from "@/lib/prisma";
import { engagementEconomics, rateForBandWeek } from "@/lib/work/capacity";
import { upcomingWeeks } from "@/lib/work-taxonomy";

/**
 * Portfolio P&L + bonus readout + anti-hoarding gauge (spec §5.3–5.4, §8).
 *
 *   Recognized revenue (% completion)
 * − Consumed labor at loaded rates
 * − Booked-unused labor            (own line — waste is visible)
 * = Contribution
 * − Director base (annual)
 * ± Manual adjustments
 * = Portfolio Gross Profit  → GP% = GP ÷ recognized revenue
 *
 * Cost-exempt directors cost $0 (their base is the director line, not labor).
 * This is a to-date snapshot — the bonus is the "if the year ended today" figure.
 */

const BONUS_CAP = 1.5; // payout caps at 1.5× par
const HOARDING_GREEN = 0.85;
const HOARDING_YELLOW = 0.7;

export async function addPnlAdjustment(input: {
  portfolioId: string;
  amountCents: number;
  memo: string;
  periodMonth?: string | null;
  createdBy?: string | null;
}) {
  return prisma.pnlAdjustment.create({
    data: {
      portfolioId: input.portfolioId,
      amountCents: input.amountCents,
      memo: input.memo,
      periodMonth: input.periodMonth ? new Date(input.periodMonth) : null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export type PortfolioPnl = {
  portfolio: {
    id: string;
    name: string;
    directorName: string;
    declaredRevenueCents: number;
    directorCostAnnualCents: number;
    gpTargetPct: number;
    parBonusPct: number;
    cliffBandPct: number;
  };
  recognizedRevenueCents: number;
  consumedLaborCents: number;
  bookedUnusedCents: number;
  contributionCents: number; // recognized − labor − booked-unused
  directorCostCents: number; // annual base
  adjustmentsCents: number;
  grossProfitCents: number;
  gpPct: number | null;
  bonus: {
    parBonusCents: number;
    targetGpCents: number;
    attainment: number | null;
    payoutCents: number;
    cliffApplied: boolean;
  };
  hoarding: { ratio: number | null; band: "green" | "yellow" | "red" | "na"; consumed: number; booked: number };
  engagements: {
    id: string;
    client: string;
    recognizedRevenueCents: number;
    consumedCostCents: number;
    gpCents: number;
    burnPct: number | null;
    overBudget: boolean;
  }[];
};

export async function portfolioPnl(portfolioId: string): Promise<PortfolioPnl | null> {
  const p = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      engagements: { orderBy: { clientName: "asc" }, select: { id: true, clientName: true } },
      adjustments: { select: { amountCents: true } },
      bookings: {
        where: { status: { notIn: ["DECLINED", "RELEASED"] } },
        include: { resource: { select: { costExempt: true } } },
      },
    },
  });
  if (!p) return null;

  // Per-engagement economics (recognized revenue + consumed labor + GP).
  let recognizedRevenueCents = 0;
  let consumedLaborCents = 0;
  const engagements: PortfolioPnl["engagements"] = [];
  for (const e of p.engagements) {
    const econ = await engagementEconomics(e.id);
    if (!econ) continue;
    recognizedRevenueCents += econ.recognizedRevenueCents;
    consumedLaborCents += econ.totals.consumedCostCents;
    engagements.push({
      id: e.id,
      client: e.clientName,
      recognizedRevenueCents: econ.recognizedRevenueCents,
      consumedCostCents: econ.totals.consumedCostCents,
      gpCents: econ.grossProfitCents,
      burnPct: econ.burnPct,
      overBudget: econ.overBudget,
    });
  }

  // Booked-unused (portfolio-wide) + trailing-8-week hoarding, from bookings.
  const rateCache = new Map<string, number>();
  const rateFor = async (roleBandId: string, isoWeek: string, snapshot: number | null, costExempt: boolean): Promise<number> => {
    if (costExempt) return 0;
    if (snapshot != null) return snapshot;
    const key = `${roleBandId}|${isoWeek}`;
    if (rateCache.has(key)) return rateCache.get(key)!;
    const r = await rateForBandWeek(roleBandId, isoWeek);
    const v = r?.loadedRateCents ?? 0;
    rateCache.set(key, v);
    return v;
  };

  const trailing = new Set(upcomingWeeks(8, new Date(Date.now() - 7 * 7 * 86400000)));
  let bookedUnusedCents = 0;
  let hoardConsumed = 0;
  let hoardBooked = 0;
  for (const b of p.bookings) {
    const booked = Number(b.hoursBooked);
    const consumed = Number(b.hoursConsumed);
    if (booked > consumed) {
      const rate = await rateFor(b.roleBandId, b.isoWeek, b.rateCentsSnapshot, b.resource.costExempt);
      bookedUnusedCents += Math.round((booked - consumed) * rate);
    }
    if (trailing.has(b.isoWeek) && booked > 0) {
      hoardBooked += booked;
      hoardConsumed += consumed;
    }
  }

  const adjustmentsCents = p.adjustments.reduce((s, a) => s + a.amountCents, 0);
  const contributionCents = recognizedRevenueCents - consumedLaborCents - bookedUnusedCents;
  const directorCostCents = p.directorCostCentsAnnual;
  const grossProfitCents = contributionCents - directorCostCents + adjustmentsCents;
  const gpPct = recognizedRevenueCents > 0 ? grossProfitCents / recognizedRevenueCents : null;

  // Bonus: par = declared × parPct; target GP = declared × gpTargetPct.
  const declared = p.declaredPortfolioRevenueCents;
  const parBonusCents = Math.round(declared * Number(p.parBonusPct));
  const targetGpCents = Math.round(declared * Number(p.gpTargetPct));
  const attainment = targetGpCents > 0 ? grossProfitCents / targetGpCents : null;
  const cliff = Number(p.bonusCliffBandPct);
  let payoutCents = 0;
  let cliffApplied = false;
  if (attainment != null) {
    if (attainment < 1 - cliff) {
      payoutCents = 0;
      cliffApplied = true;
    } else {
      payoutCents = Math.round(Math.min(BONUS_CAP, attainment) * parBonusCents);
    }
  }

  const ratio = hoardBooked > 0 ? hoardConsumed / hoardBooked : null;
  const band: PortfolioPnl["hoarding"]["band"] =
    ratio == null ? "na" : ratio >= HOARDING_GREEN ? "green" : ratio >= HOARDING_YELLOW ? "yellow" : "red";

  return {
    portfolio: {
      id: p.id,
      name: p.name,
      directorName: p.directorName,
      declaredRevenueCents: declared,
      directorCostAnnualCents: p.directorCostCentsAnnual,
      gpTargetPct: Number(p.gpTargetPct),
      parBonusPct: Number(p.parBonusPct),
      cliffBandPct: cliff,
    },
    recognizedRevenueCents,
    consumedLaborCents,
    bookedUnusedCents,
    contributionCents,
    directorCostCents,
    adjustmentsCents,
    grossProfitCents,
    gpPct,
    bonus: { parBonusCents, targetGpCents, attainment, payoutCents, cliffApplied },
    hoarding: { ratio, band, consumed: hoardConsumed, booked: hoardBooked },
    engagements,
  };
}
