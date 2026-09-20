/**
 * Throwaway smoke test for PACE actuals — QBO-native statement rebuild (no COA
 * mapping). Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-pace.ts
 * Creates throwaway entities/TBs and cleans them up.
 */
import { prisma } from "@/lib/prisma";
import { importTrialBalance } from "@/lib/pace/import";
import { buildStatement, latestBankCashCents } from "@/lib/pace/statements";
import { qboConfigured } from "@/lib/pace/qbo";

const MONTH = "2026-07-01";

async function main() {
  const eA = await prisma.entity.create({ data: { name: "ZZZ Entity A", connection: { create: {} } } });
  const eB = await prisma.entity.create({ data: { name: "ZZZ Entity B", connection: { create: {} } } });

  // Balanced TB for A — accounts carry QBO AccountType (the native classifier).
  // One row (Suspense) deliberately has no type → lands in "Unclassified".
  const impA = await importTrialBalance({
    entityId: eA.id,
    periodMonth: MONTH,
    rows: [
      { name: "Operating Checking", amount: 120000, accountType: "Bank" },
      { name: "Accounts Receivable", amount: 30000, accountType: "Accounts Receivable" },
      { name: "Consulting Income", amount: -210000, accountType: "Income" },
      { name: "Payroll", amount: 90000, accountType: "Expense" },
      { name: "Suspense", amount: 20000 }, // no AccountType → Unclassified
      { name: "Retained Earnings", amount: -50000, accountType: "Equity" },
    ],
  });
  console.log(`import A → balanced=${impA.balanced} unclassified=${impA.unclassified} imbalance=${impA.imbalance}`);
  if (!impA.balanced) throw new Error("expected balanced TB (sum=0)");
  if (impA.unclassified !== 1) throw new Error(`expected 1 unclassified, got ${impA.unclassified}`);

  // Income statement for A: revenue 210k, opex (payroll) 90k, plus the 20k
  // unclassified debit (shown on the P&L, subtracted from net income).
  const isA = await buildStatement(eA.id, MONTH, "IS");
  console.log(
    `A income stmt → revenue=${isA.subtotals.revenue} opex=${isA.subtotals.opex} net=${isA.subtotals.netIncome} unclassified=${isA.unclassifiedAmount}`,
  );
  if (isA.subtotals.revenue !== 210000) throw new Error("revenue mismatch");
  if (isA.subtotals.opex !== 90000) throw new Error("opex mismatch");
  if (isA.unclassifiedAmount !== 20000) throw new Error("unclassified should be the 20k Suspense");
  if (isA.subtotals.netIncome !== 100000) throw new Error("net income = 210k - 90k - 20k unclassified");

  // Sections render in statement order with subtotals.
  const secs = isA.groups.map((g) => `${g.section}:${g.subtotal}`).join(", ");
  console.log(`A IS sections → ${secs}`);
  if (!isA.groups.some((g) => g.section === "Revenue" && g.subtotal === 210000)) throw new Error("Revenue section wrong");

  // Balance sheet: cash is a Bank account; opening cash pulls from Bank accounts.
  const bsA = await buildStatement(eA.id, MONTH, "BS");
  console.log(`A balance sheet → assets=${bsA.subtotals.assets} equity=${bsA.subtotals.equity}`);
  if (bsA.subtotals.assets !== 150000) throw new Error("assets = 120k cash + 30k AR");
  const cash = await latestBankCashCents(eA.id);
  console.log(`latestBankCash(A) → ${cash?.cents} cents (expect 12000000)`);
  if (!cash || cash.cents !== 12000000) throw new Error("bank cash should be 120000.00");

  // Entity B + consolidated (QBO AccountType is standardized → sums cleanly).
  await importTrialBalance({
    entityId: eB.id,
    periodMonth: MONTH,
    rows: [
      { name: "Checking", amount: 50000, accountType: "Bank" },
      { name: "Revenue", amount: -80000, accountType: "Income" },
      { name: "Payroll", amount: 30000, accountType: "Expense" },
    ],
  });
  const cons = await buildStatement(null, MONTH, "IS");
  console.log(`consolidated income → revenue=${cons.subtotals.revenue} (expect 290000)`);
  if (cons.subtotals.revenue !== 290000) throw new Error("consolidated revenue should sum A+B (210k+80k)");

  // Unbalanced import flags balanced=false and keeps all lines.
  const impUnbal = await importTrialBalance({
    entityId: eB.id,
    periodMonth: "2026-08-01",
    rows: [
      { name: "Checking", amount: 100, accountType: "Bank" },
      { name: "Revenue", amount: -60, accountType: "Income" },
    ],
  });
  console.log(`unbalanced import → balanced=${impUnbal.balanced} imbalance=${impUnbal.imbalance}`);
  if (impUnbal.balanced) throw new Error("expected balanced=false");

  console.log(`\nqboConfigured=${qboConfigured()} (manual path active)`);

  for (const id of [eA.id, eB.id]) await prisma.entity.delete({ where: { id } }).catch(() => {});
  console.log("cleaned up throwaway entities");

  console.log("\n✅ PACE actuals (QBO-native) smoke passed");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
