import type { StaffLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Firm-wide standard rate card. Cost = what the level costs the firm per hour;
 * Bill = the standard billing rate per hour. Scoping cards default their rates
 * from here. Seeded with editable industry-typical placeholders — set your real
 * rates in Settings → Rate card (or via PUT /api/agent/rate-card).
 */

export const STAFF_LEVELS: StaffLevel[] = [
  "ASSOCIATE",
  "SENIOR",
  "MANAGER",
  "DIRECTOR",
  "PARTNER",
];

export const STAFF_LEVEL_LABELS: Record<StaffLevel, string> = {
  ASSOCIATE: "Associate",
  SENIOR: "Senior",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  PARTNER: "Partner",
};

export type RateRow = { level: StaffLevel; cost: number; bill: number };

const DEFAULT_RATES: RateRow[] = [
  { level: "ASSOCIATE", cost: 45, bill: 150 },
  { level: "SENIOR", cost: 65, bill: 200 },
  { level: "MANAGER", cost: 95, bill: 275 },
  { level: "DIRECTOR", cost: 130, bill: 350 },
  { level: "PARTNER", cost: 175, bill: 450 },
];

let seeded = false;

export async function ensureRateCardSeeded() {
  if (seeded) return;
  const count = await prisma.rateCardLevel.count();
  if (count < STAFF_LEVELS.length) {
    for (let i = 0; i < DEFAULT_RATES.length; i++) {
      const r = DEFAULT_RATES[i];
      await prisma.rateCardLevel.upsert({
        where: { level: r.level },
        update: {},
        create: { level: r.level, cost: r.cost, bill: r.bill, sortOrder: i },
      });
    }
  }
  seeded = true;
}

export async function getRateCard(): Promise<RateRow[]> {
  await ensureRateCardSeeded();
  const rows = await prisma.rateCardLevel.findMany({ orderBy: { sortOrder: "asc" } });
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  // Always return all five levels in canonical order.
  return STAFF_LEVELS.map((level, i) => {
    const r = byLevel.get(level);
    const fallback = DEFAULT_RATES.find((d) => d.level === level)!;
    return {
      level,
      cost: r ? Number(r.cost) : fallback.cost,
      bill: r ? Number(r.bill) : fallback.bill,
      sortOrder: i,
    } as RateRow;
  });
}
