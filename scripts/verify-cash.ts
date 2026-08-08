/**
 * Throwaway smoke for Finance → Cash forecast. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-cash.ts
 */
import { prisma } from "@/lib/prisma";
import { buildForecast, setCashPosition, addCashLine, deleteCashLine, listCashLines } from "@/lib/pace/cash";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Opening $100k, min-cash $20k.
  await setCashPosition({ openingCents: 100_000_00, openingAsOf: ymd(new Date()), minCashCents: 20_000_00 });

  // Clean any prior test lines.
  const existing = await listCashLines();
  for (const l of existing.filter((x) => x.label.startsWith("ZZZ "))) await deleteCashLine(l.id);

  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);
  const in3Weeks = new Date(today.getTime() + 21 * 86_400_000);

  // Weekly recurring outflow $5k (payroll-style), one-time inflow $30k in 3 weeks.
  const l1 = await addCashLine({ label: "ZZZ Payroll", kind: "OUTFLOW", amountCents: 5_000_00, cadence: "WEEKLY", startDate: ymd(nextWeek) });
  const l2 = await addCashLine({ label: "ZZZ Deposit", kind: "INFLOW", amountCents: 30_000_00, cadence: "ONE_TIME", startDate: ymd(in3Weeks) });

  const wk = await buildForecast("weekly");
  console.log(`weekly: ${wk.rows.length} buckets, opening=$${(wk.openingCents / 100).toFixed(0)}, ending=$${(wk.totals.endingCents / 100).toFixed(0)}`);
  if (wk.rows.length !== 13) throw new Error("expected 13 weekly buckets");
  if (wk.openingCents !== 100_000_00) throw new Error("opening not applied");

  // Roll integrity: each ending = beginning + inflow − outflow; beginnings chain.
  for (let i = 0; i < wk.rows.length; i++) {
    const r = wk.rows[i];
    if (r.endingCents !== r.beginningCents + r.inflowCents - r.outflowCents) throw new Error(`row ${i} roll broke`);
    if (i > 0 && r.beginningCents !== wk.rows[i - 1].endingCents) throw new Error(`row ${i} beginning != prior ending`);
  }
  if (wk.rows[0].beginningCents !== 100_000_00) throw new Error("first beginning != opening");

  // The weekly $5k outflow should appear (manual out) and the $30k inflow once.
  const totalManualIn = wk.rows.reduce((s, r) => s + r.sources.manualInCents, 0);
  const totalManualOut = wk.rows.reduce((s, r) => s + r.sources.manualOutCents, 0);
  console.log(`manual in total=$${(totalManualIn / 100).toFixed(0)} (30k), out total=$${(totalManualOut / 100).toFixed(0)} (payroll x weeks)`);
  if (totalManualIn !== 30_000_00) throw new Error("one-time inflow should total $30k exactly once");
  if (totalManualOut < 5_000_00) throw new Error("weekly outflow missing");
  // With payroll each week and opening 100k, ending should decline (no other flows here).
  if (wk.totals.endingCents >= wk.openingCents) throw new Error("ending should drop below opening given net outflow");

  const mo = await buildForecast("monthly");
  console.log(`monthly: ${mo.rows.length} buckets, ending=$${(mo.totals.endingCents / 100).toFixed(0)}, firstBreach=${mo.firstBreachKey}`);
  if (mo.rows.length !== 12) throw new Error("expected 12 monthly buckets");
  // Monthly should also honor the roll identity.
  for (const r of mo.rows) if (r.endingCents !== r.beginningCents + r.inflowCents - r.outflowCents) throw new Error("monthly roll broke");

  // Cleanup.
  await deleteCashLine(l1.id).catch(() => {});
  await deleteCashLine(l2.id).catch(() => {});
  console.log("cleaned up throwaway lines");
  console.log("\n✅ Cash forecast smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
