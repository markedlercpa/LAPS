/**
 * Throwaway smoke for Finance → Cash forecast (14-day / 13-week / 12-month).
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-cash.ts
 */
import { prisma } from "@/lib/prisma";
import { buildDirectForecast, buildIndirectForecast, setCashConfig, addCashLine, listCashLines, deleteCashLine } from "@/lib/pace/cash";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  await setCashConfig({
    useQboOpening: false,
    openingCents: 100_000_00,
    openingAsOf: ymd(new Date()),
    minCashCents: 20_000_00,
    locLimitCents: 200_000_00,
    locOpeningCents: 0,
    dnaMonthlyCents: 0,
    capexMonthlyCents: 0,
    arDays: 45,
    apDays: 30,
  });

  for (const l of (await listCashLines()).filter((x) => x.label.startsWith("ZZZ "))) await deleteCashLine(l.id);

  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);
  // Weekly payroll (disbursement), one LOC draw (financing inflow), rent (monthly).
  const l1 = await addCashLine({ label: "ZZZ Payroll", category: "payroll", amountCents: 5_000_00, cadence: "WEEKLY", startDate: ymd(nextWeek) });
  const l2 = await addCashLine({ label: "ZZZ LOC draw", category: "loc_draws", amountCents: 10_000_00, cadence: "ONE_TIME", startDate: ymd(nextWeek) });
  const l3 = await addCashLine({ label: "ZZZ Rent", category: "rent_occupancy", amountCents: 8_000_00, cadence: "MONTHLY", startDate: ymd(today) });

  // ── 14-day ──
  const d = await buildDirectForecast("daily");
  console.log(`daily: ${d.columns.length} cols, opening=$${(d.opening.cents / 100).toFixed(0)}, ending=$${(d.ending[d.ending.length - 1] / 100).toFixed(0)}`);
  if (d.columns.length !== 14) throw new Error("expected 14 daily columns");
  if (d.beginning[0] !== 100_000_00) throw new Error("opening not applied (daily)");
  // Roll identity: ending = beginning + netOperating + financing; beginnings chain.
  for (let i = 0; i < d.columns.length; i++) {
    const expect = d.beginning[i] + d.netOperating.values[i] + d.financing.subtotal[i];
    if (d.ending[i] !== expect) throw new Error(`daily roll broke at ${i}`);
    if (i > 0 && d.beginning[i] !== d.ending[i - 1]) throw new Error(`daily chain broke at ${i}`);
  }

  // ── 13-week ──
  const w = await buildDirectForecast("weekly");
  console.log(`weekly: ${w.columns.length} cols, ending=$${(w.ending[w.ending.length - 1] / 100).toFixed(0)}`);
  if (w.columns.length !== 13) throw new Error("expected 13 weekly columns");
  // Payroll should show as a negative disbursement row.
  const payroll = w.groups[1].rows.find((r) => r.key === "payroll")!;
  if (!(payroll.total < 0)) throw new Error("weekly payroll should be negative");
  // LOC draw once (+$10k), and LOC balance should reflect it; availability = limit − balance.
  const draws = w.financing.rows.find((r) => r.key === "loc_draws")!;
  if (draws.total !== 10_000_00) throw new Error("LOC draw should total $10k");
  const drawIdx = draws.values.findIndex((v) => v > 0);
  if (drawIdx < 0 || w.loc.balance[drawIdx] !== 10_000_00) throw new Error("LOC balance not tracked");
  if (w.loc.availability[drawIdx] !== 200_000_00 - 10_000_00) throw new Error("LOC availability wrong");
  // Total liquidity = ending + availability.
  if (w.loc.totalLiquidity[0] !== w.ending[0] + w.loc.availability[0]) throw new Error("total liquidity identity broke");

  // ── 12-month indirect ──
  const m = await buildIndirectForecast();
  console.log(`monthly: ${m.columns.length} cols, ending=$${(m.ending[m.ending.length - 1] / 100).toFixed(0)}`);
  if (m.columns.length !== 12) throw new Error("expected 12 monthly columns");
  const ni = m.cash.find((r) => r.key === "ni")!;
  const cfo = m.cash.find((r) => r.key === "cfo")!;
  const addDna = m.cash.find((r) => r.key === "addback_dna")!;
  const wc = m.cash.find((r) => r.key === "wc")!;
  for (let i = 0; i < 12; i++) {
    if (cfo.values[i] !== ni.values[i] + addDna.values[i] + wc.values[i]) throw new Error(`CFO identity broke at ${i}`);
  }
  const beginning = m.cash.find((r) => r.key === "beginning")!;
  if (beginning.values[0] !== 100_000_00) throw new Error("monthly opening not applied");

  await deleteCashLine(l1.id).catch(() => {});
  await deleteCashLine(l2.id).catch(() => {});
  await deleteCashLine(l3.id).catch(() => {});
  console.log("cleaned up throwaway lines");
  console.log("\n✅ Cash forecast smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
