/**
 * Throwaway smoke for Work → Capacity (Phase 1). Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-capacity.ts
 */
import { prisma } from "@/lib/prisma";
import {
  ensureRoleBandsSeeded,
  listRoleBands,
  addRoleBandRate,
  rateForBandWeek,
  createPortfolio,
  createEngagement,
  replaceEngagementBudget,
  engagementEconomics,
  deriveLoadedRateCents,
} from "@/lib/work/capacity";
import { isoWeekOf, isoWeekStart } from "@/lib/work-taxonomy";
import { matchTimeEntries, type MatchMaps } from "@/lib/work/karbon";

async function main() {
  // ISO week helpers (pure).
  const wk = isoWeekOf(new Date("2026-08-12T00:00:00Z")); // a Wednesday
  const start = isoWeekStart(wk);
  console.log(`isoWeekOf(2026-08-12)=${wk}, weekStart=${start.toISOString().slice(0, 10)} (day ${start.getUTCDay()} == 1 Monday)`);
  if (wk !== "2026-W33" || start.getUTCDay() !== 1) throw new Error("ISO week helpers wrong");

  // Loaded-rate derivation.
  const derived = deriveLoadedRateCents({ annualLoadedCostCents: 12_000_000, weeklyCapacityHours: 40, targetUtilization: 0.8 });
  console.log(`deriveLoadedRateCents(120k, 40h, 0.8) = ${(derived / 100).toFixed(2)}/h`);
  if (derived <= 0) throw new Error("rate derivation wrong");

  await ensureRoleBandsSeeded();
  const bands = await listRoleBands();
  const assoc = bands.find((b) => b.name === "Associate")!;
  const mgr = bands.find((b) => b.name === "Manager")!;

  // Effective-dated rates: an old and a new one; week lookup must pick the right row.
  await addRoleBandRate({ roleBandId: assoc.id, loadedRateCents: 8000, effectiveFrom: "2025-01-01" });
  await addRoleBandRate({ roleBandId: assoc.id, loadedRateCents: 9000, effectiveFrom: "2026-06-01" });
  const rEarly = await rateForBandWeek(assoc.id, "2026-W01");
  const rLate = await rateForBandWeek(assoc.id, "2026-W33");
  console.log(`Associate rate 2026-W01=${rEarly?.loadedRateCents} (80), 2026-W33=${rLate?.loadedRateCents} (90)`);
  if (rEarly?.loadedRateCents !== 8000 || rLate?.loadedRateCents !== 9000) throw new Error("effective-dated rate lookup wrong");
  await addRoleBandRate({ roleBandId: mgr.id, loadedRateCents: 15000, effectiveFrom: "2025-01-01" });

  // Portfolio + engagement + budget.
  const pf = await createPortfolio({ name: "ZZZ Cap Test", directorName: "Dir", directorEmail: "dir@example.com", declaredPortfolioRevenueCents: 50_000_00, gpTargetPct: 0.5 });
  const eng = await createEngagement({ portfolioId: pf.id, clientName: "ZZZ Client", engagementType: "qoe", revenueCents: 40_000_00, karbonWorkItemKey: "WK-1" });
  await replaceEngagementBudget(eng.id, [
    { roleBandId: assoc.id, budgetedHours: 100 },
    { roleBandId: mgr.id, budgetedHours: 20 },
  ]);

  // Karbon matcher (pure): two associates entries same week + one manager, plus an unmatched person/work item.
  const res = await prisma.poolResource.create({ data: { personName: "Ana", email: "ana@example.com", roleBandId: assoc.id } });
  const maps: MatchMaps = {
    resourcesByEmail: new Map([["ana@example.com", { id: res.id, roleBandId: assoc.id }]]),
    resourcesByKarbonId: new Map(),
    engagementsByWorkItem: new Map([["WK-1", { id: eng.id, portfolioId: pf.id }]]),
  };
  const match = matchTimeEntries(
    [
      { userEmail: "ana@example.com", workItemKey: "WK-1", hours: 6, date: "2026-08-10" },
      { userEmail: "ana@example.com", workItemKey: "WK-1", hours: 4, date: "2026-08-12" }, // same ISO week → sums to 10
      { userEmail: "ghost@example.com", workItemKey: "WK-1", hours: 3, date: "2026-08-12" }, // unmatched person
      { userEmail: "ana@example.com", workItemKey: "WK-UNKNOWN", hours: 2, date: "2026-08-12" }, // unmatched work item
    ],
    maps,
  );
  console.log(`matcher: ${match.upserts.length} upsert(s), first hours=${match.upserts[0]?.hoursConsumed} (10), unmatchedPeople=${match.unmatchedResources.length}, unmatchedWork=${match.unmatchedWorkItems.length}`);
  if (match.upserts.length !== 1 || match.upserts[0].hoursConsumed !== 10) throw new Error("matcher bucketing wrong");
  if (match.unmatchedResources.length !== 1 || match.unmatchedWorkItems.length !== 1) throw new Error("matcher unmatched reporting wrong");
  if (match.upserts[0].isoWeek !== "2026-W33") throw new Error("matcher week wrong");

  // Land the consumed hours and check economics: 10h Associate @ $90 = $900 consumed cost.
  await prisma.capacityBooking.create({
    data: {
      engagementId: eng.id,
      portfolioId: pf.id,
      resourceId: res.id,
      roleBandId: assoc.id,
      isoWeek: "2026-W33",
      hoursBooked: 0,
      hoursConsumed: 10,
      status: "CONSUMED_CLOSED",
      unbookedConsumption: true,
    },
  });
  const econ = (await engagementEconomics(eng.id))!;
  console.log(`economics: consumed=${econ.totals.consumed}h cost=${(econ.totals.consumedCostCents / 100).toFixed(2)} GP=${(econ.grossProfitCents / 100).toFixed(2)} realized=${econ.realizedRateCents}`);
  if (econ.totals.consumedCostCents !== 90000) throw new Error(`consumed cost should be $900, got ${econ.totals.consumedCostCents}`);
  if (econ.grossProfitCents !== 40_000_00 - 90000) throw new Error("engagement GP wrong");
  if (econ.realizedRateCents !== Math.round(40_000_00 / 10)) throw new Error("realized rate wrong");
  const assocLine = econ.lines.find((l) => l.band === "Associate")!;
  if (assocLine.budgetedHours !== 100 || assocLine.consumedHours !== 10) throw new Error("band line wrong");

  // Cleanup.
  await prisma.portfolio.delete({ where: { id: pf.id } }).catch(() => {});
  await prisma.poolResource.delete({ where: { id: res.id } }).catch(() => {});
  console.log("cleaned up throwaway rows");
  console.log("\n✅ Capacity Phase 1 smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
