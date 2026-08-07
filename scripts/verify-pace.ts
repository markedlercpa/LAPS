/**
 * Throwaway smoke test for PACE Phase 1. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-pace.ts
 * Creates throwaway entities/TBs and cleans them up.
 */
import { prisma } from "@/lib/prisma";
import { ensureReportingCoaSeeded, unmappedAccounts, mapAccount } from "@/lib/pace/coa";
import { importTrialBalance } from "@/lib/pace/import";
import { buildStatement } from "@/lib/pace/statements";
import { qboConfigured } from "@/lib/pace/qbo";

const MONTH = "2026-07-01";

async function main() {
  await ensureReportingCoaSeeded();
  const ra = await prisma.reportingAccount.findMany({ select: { id: true, code: true } });
  const byCode = new Map(ra.map((r) => [r.code, r.id]));
  console.log(`reporting COA seeded: ${ra.length} accounts\n`);

  const eA = await prisma.entity.create({ data: { name: "ZZZ Entity A", connection: { create: {} } } });
  const eB = await prisma.entity.create({ data: { name: "ZZZ Entity B", connection: { create: {} } } });

  // Balanced TB for A (one account intentionally left unmapped → exception queue)
  const impA = await importTrialBalance({
    entityId: eA.id,
    periodMonth: MONTH,
    rows: [
      { name: "Cash", amount: 120000, reportingCode: "1000" },
      { name: "Accounts Receivable", amount: 30000, reportingCode: "1100" },
      { name: "Revenue - Consulting", amount: -210000, reportingCode: "4100" },
      { name: "Payroll", amount: 90000, reportingCode: "6000" },
      { name: "Rent", amount: 20000 }, // no reportingCode → unmapped
      { name: "Retained Earnings", amount: -50000, reportingCode: "3200" },
    ],
  });
  console.log(`import A → balanced=${impA.balanced} unmapped=${impA.unmapped} imbalance=${impA.imbalance}`);
  if (!impA.balanced) throw new Error("expected balanced TB (sum=0)");
  if (impA.unmapped !== 1) throw new Error(`expected 1 unmapped, got ${impA.unmapped}`);

  // Exception queue surfaces the unmapped Rent account
  const unmapped = await unmappedAccounts(eA.id);
  console.log(`exception queue: ${unmapped.map((u) => u.name).join(", ")}`);
  if (unmapped.length !== 1 || unmapped[0].name !== "Rent") throw new Error("exception queue wrong");

  // Income statement for A (revenue 210k, opex payroll 90k; rent unmapped so excluded)
  const isA = await buildStatement(eA.id, MONTH, "IS");
  console.log(`A income stmt → revenue=${isA.subtotals.revenue} opex=${isA.subtotals.opex} net=${isA.subtotals.netIncome} unmappedAmt=${isA.unmappedAmount}`);
  if (isA.subtotals.revenue !== 210000) throw new Error("revenue mismatch");
  if (isA.subtotals.opex !== 90000) throw new Error("opex mismatch");
  if (isA.subtotals.netIncome !== 120000) throw new Error("net income mismatch (210k - 90k)");
  if (isA.unmappedAmount !== 20000) throw new Error("unmapped amount should be the 20k Rent");

  // Map the Rent account → statements pick it up
  await mapAccount(unmapped[0].id, byCode.get("6200") as string);
  const isA2 = await buildStatement(eA.id, MONTH, "IS");
  console.log(`A after mapping Rent → opex=${isA2.subtotals.opex} net=${isA2.subtotals.netIncome} unmappedAmt=${isA2.unmappedAmount}`);
  if (isA2.subtotals.opex !== 110000) throw new Error("opex should include rent now (110k)");
  if (isA2.unmappedAmount !== 0) throw new Error("nothing should be unmapped now");

  // Entity B + consolidated
  await importTrialBalance({
    entityId: eB.id,
    periodMonth: MONTH,
    rows: [
      { name: "Cash", amount: 50000, reportingCode: "1000" },
      { name: "Revenue", amount: -80000, reportingCode: "4000" },
      { name: "Payroll", amount: 30000, reportingCode: "6000" },
    ],
  });
  const cons = await buildStatement(null, MONTH, "IS");
  console.log(`consolidated income → revenue=${cons.subtotals.revenue} (expect 290000)`);
  if (cons.subtotals.revenue !== 290000) throw new Error("consolidated revenue should sum A+B (210k+80k)");

  // Unbalanced import flags balanced=false and keeps all lines
  const impUnbal = await importTrialBalance({
    entityId: eB.id,
    periodMonth: "2026-08-01",
    rows: [
      { name: "Cash", amount: 100, reportingCode: "1000" },
      { name: "Revenue", amount: -60, reportingCode: "4000" },
    ],
  });
  console.log(`unbalanced import → balanced=${impUnbal.balanced} imbalance=${impUnbal.imbalance}`);
  if (impUnbal.balanced) throw new Error("expected balanced=false");

  console.log(`\nqboConfigured=${qboConfigured()} (manual path active)`);

  // Cleanup (entity cascade removes connections/accounts/periods/lines/runs).
  for (const id of [eA.id, eB.id]) await prisma.entity.delete({ where: { id } }).catch(() => {});
  console.log("cleaned up throwaway entities");

  console.log("\n✅ PACE smoke passed");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
