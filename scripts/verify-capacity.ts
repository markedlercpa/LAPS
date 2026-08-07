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
  directorEconomics,
} from "@/lib/work/capacity";
import { isoWeekOf, isoWeekStart } from "@/lib/work-taxonomy";
import { logTime, deleteTimeEntry } from "@/lib/work/time";
import { requestBooking, confirmBooking, releaseBooking, isPastCutoff, weekIsClosed } from "@/lib/work/bookings";
import { computeWeekCharges, closeWeek } from "@/lib/work/weekclose";

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

  // Economics: 10h Associate @ $90 = $900 consumed cost. Budget total 120h →
  // 10/120 ≈ 8.3% complete → recognized = $40,000 × 8.3% = $3,333.33.
  const econ = (await engagementEconomics(eng.id))!;
  console.log(`economics: consumed=${econ.totals.consumed}h cost=$${(econ.totals.consumedCostCents / 100).toFixed(2)} pct=${econ.pctComplete} recognized=$${(econ.recognizedRevenueCents / 100).toFixed(2)} GP=$${(econ.grossProfitCents / 100).toFixed(2)}`);
  if (econ.totals.consumedCostCents !== 90000) throw new Error(`consumed cost should be $900, got ${econ.totals.consumedCostCents}`);
  const expectedRecognized = Math.round(40_000_00 * (10 / 120));
  if (econ.recognizedRevenueCents !== expectedRecognized) throw new Error(`recognized revenue wrong: ${econ.recognizedRevenueCents} vs ${expectedRecognized}`);
  if (econ.grossProfitCents !== expectedRecognized - 90000) throw new Error("recognized GP wrong");
  if (econ.realizedRateCents !== Math.round(40_000_00 / 10)) throw new Error("realized rate wrong");

  // Cost-exempt director: logs 5h on the same engagement → hours rise to 15 but
  // consumed cost stays $900 (director carried on the portfolio, not per-hour).
  const dir = await prisma.poolResource.create({ data: { personName: "Maher", email: "maher@example.com", roleBandId: mgr.id, costExempt: true } });
  await logTime({ resourceId: dir.id, engagementId: eng.id, workDate: "2026-08-11", hours: 5 });
  const econ2 = (await engagementEconomics(eng.id))!;
  console.log(`with director: consumed=${econ2.totals.consumed}h (15) cost=$${(econ2.totals.consumedCostCents / 100).toFixed(2)} (still 900)`);
  if (econ2.totals.consumed !== 15) throw new Error("director hours not counted");
  if (econ2.totals.consumedCostCents !== 90000) throw new Error("director hours should cost $0");

  // Director economics: $2.4M book, $120k base, 5% par → base 5%, on-target 10%.
  const de = directorEconomics({ declaredPortfolioRevenueCents: 240_000_000, directorCostCentsAnnual: 12_000_000, parBonusPct: 0.05 });
  console.log(`director econ: base%=${de.basePct} parBonus=$${(de.parBonusCents / 100).toLocaleString()} onTarget%=${de.onTargetPct}`);
  if (de.parBonusCents !== 12_000_000 || de.basePct !== 0.05 || de.onTargetPct !== 0.1) throw new Error("director economics wrong");

  // ── Booking lifecycle (hoteling board) ──
  // Auto-confirm: 6h (≤8) on a resource with ample free capacity → CONFIRMED.
  const bAuto = await requestBooking({ engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W50", hoursBooked: 6 });
  if (!bAuto.ok || bAuto.status !== "CONFIRMED") throw new Error("small request should auto-confirm");
  // Larger request → queued REQUESTED, then broker confirm.
  const bBig = await requestBooking({ engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W51", hoursBooked: 30 });
  if (!bBig.ok || bBig.status !== "REQUESTED") throw new Error("30h should queue as requested");
  const conf = await confirmBooking(bBig.id, "tester");
  if (!conf.ok) throw new Error("confirm 30h should succeed within 40h capacity");
  // Conflict: another 30h same resource+week overbooks (30+30 > 40) → confirm rejected.
  const eng2 = await createEngagement({ portfolioId: pf.id, clientName: "ZZZ Client 2" });
  await replaceEngagementBudget(eng2.id, [{ roleBandId: assoc.id, budgetedHours: 100 }]);
  const bConf = await requestBooking({ engagementId: eng2.id, resourceId: res.id, isoWeek: "2026-W51", hoursBooked: 30 });
  const confBad = await confirmBooking((bConf as { id: string }).id, "tester");
  console.log(`overbook confirm → ok=${confBad.ok} (expect false)`);
  if (confBad.ok) throw new Error("overbooking confirm should be rejected");
  // Release before cutoff (future week) → RELEASED, uncharged.
  const rel = await releaseBooking(bAuto.id);
  if (!rel.ok || rel.charged) throw new Error("future-week release should be uncharged");
  // Release after cutoff (past week) → stays confirmed, still charges.
  const bPast = await requestBooking({ engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W01", hoursBooked: 4 });
  if (!bPast.ok) throw new Error("past-week request failed");
  console.log(`isPastCutoff(2026-W01)=${isPastCutoff("2026-W01")} (expect true)`);
  const relPast = await releaseBooking(bPast.id);
  console.log(`release past cutoff → charged=${relPast.ok && relPast.charged} (expect true)`);
  if (!relPast.ok || !relPast.charged) throw new Error("past-cutoff release should still charge");

  // Week close: 2026-W33 has 10h consumed @ $90 + 5h director @ $0 = $900 consumed labor.
  const preview = await computeWeekCharges("2026-W33");
  console.log(`W33 charges preview: $${(preview.totalCents / 100).toFixed(2)} (expect 900)`);
  if (preview.totalCents !== 90000) throw new Error(`W33 charge should be $900, got ${preview.totalCents}`);
  const close = await closeWeek("2026-W33", "tester");
  if (!close.ok || close.totalCents !== 90000) throw new Error("closeWeek total wrong");
  if (!(await weekIsClosed("2026-W33"))) throw new Error("week should be closed");

  // Booked-unused: confirm 10h on an empty future week → charges 10h × $90 with 0 consumed.
  const bUnused = await requestBooking({ engagementId: eng.id, resourceId: res.id, isoWeek: "2026-W44", hoursBooked: 10 });
  await confirmBooking((bUnused as { id: string }).id, "tester");
  const w44 = await computeWeekCharges("2026-W44");
  const pfCharge = w44.charges.find((c) => c.portfolioId === pf.id);
  console.log(`W44 booked-unused: $${((pfCharge?.bookedUnusedCents ?? 0) / 100).toFixed(2)} (expect 900)`);
  if ((pfCharge?.bookedUnusedCents ?? 0) !== 90000) throw new Error("booked-unused charge wrong");

  // Cleanup.
  await prisma.poolResource.delete({ where: { id: dir.id } }).catch(() => {});
  await prisma.portfolio.delete({ where: { id: pf.id } }).catch(() => {});
  await prisma.poolResource.delete({ where: { id: res.id } }).catch(() => {});
  console.log("cleaned up throwaway rows");
  console.log("\n✅ Capacity Phase 1 smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
