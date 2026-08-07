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
import { logTime, deleteTimeEntry } from "@/lib/work/time";

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
  const eng = await createEngagement({ portfolioId: pf.id, clientName: "ZZZ Client", engagementType: "qoe", revenueCents: 40_000_00 });
  await replaceEngagementBudget(eng.id, [
    { roleBandId: assoc.id, budgetedHours: 100 },
    { roleBandId: mgr.id, budgetedHours: 20 },
  ]);

  // Native time tracking: two entries in the same ISO week roll up to one
  // consumed-only booking of 10h. A third entry in a different week is separate.
  const res = await prisma.poolResource.create({ data: { personName: "Ana", email: "ana@example.com", roleBandId: assoc.id } });
  const e1 = await logTime({ resourceId: res.id, engagementId: eng.id, workDate: "2026-08-10", hours: 6 });
  await logTime({ resourceId: res.id, engagementId: eng.id, workDate: "2026-08-12", hours: 4 }); // same week → 10
  if (!e1.ok) throw new Error("logTime failed");
  const booking = await prisma.capacityBooking.findUnique({
    where: { engagementId_resourceId_isoWeek: { engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W33" } },
  });
  console.log(`time rollup: booking consumed=${Number(booking?.hoursConsumed)} (10), unbooked=${booking?.unbookedConsumption}`);
  if (!booking || Number(booking.hoursConsumed) !== 10 || !booking.unbookedConsumption) throw new Error("time rollup wrong");

  // Deleting one entry re-rolls to 6; the booking stays.
  await deleteTimeEntry(e1.id);
  const afterDel = await prisma.capacityBooking.findUnique({
    where: { engagementId_resourceId_isoWeek: { engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W33" } },
  });
  console.log(`after delete: consumed=${Number(afterDel?.hoursConsumed)} (4)`);
  if (Number(afterDel?.hoursConsumed) !== 4) throw new Error("re-rollup after delete wrong");
  // Re-log so economics below see 10h.
  await logTime({ resourceId: res.id, engagementId: eng.id, workDate: "2026-08-10", hours: 6 });

  // Economics: 10h Associate @ $90 = $900 consumed cost.
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
