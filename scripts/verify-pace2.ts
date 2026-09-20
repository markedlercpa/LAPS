/**
 * Throwaway smoke test for PACE Phase 2 (Expectations) under the QBO-native
 * rebuild. Budgets are native at the QBO account level; budget-vs-actual is
 * account-to-account. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-pace2.ts
 */
import { prisma } from "@/lib/prisma";
import { importTrialBalance } from "@/lib/pace/import";
import { createBudget, saveBudgetLinesBulk, setBudgetStatus, deleteBudget } from "@/lib/pace/budgets";
import { computeVariance } from "@/lib/pace/variance";
import { upsertNote, notesForMonth, narrativesConfigured } from "@/lib/pace/narratives";

const MONTH = "2026-07-01";

async function main() {
  const entity = await prisma.entity.create({ data: { name: "ZZZ P2 Co", connection: { create: {} } } });

  // Actuals classified natively by QBO AccountType: revenue 210k, payroll 90k.
  // importTrialBalance keys LedgerAccounts by externalId (= name when none given).
  await importTrialBalance({
    entityId: entity.id,
    periodMonth: MONTH,
    rows: [
      { name: "Checking", amount: 120000, accountType: "Bank" },
      { name: "Revenue", amount: -210000, accountType: "Income" },
      { name: "Payroll", amount: 90000, accountType: "Expense" },
    ],
  });
  const accts = await prisma.ledgerAccount.findMany({ where: { entityId: entity.id }, select: { id: true, name: true } });
  const revId = accts.find((a) => a.name === "Revenue")!.id;
  const payId = accts.find((a) => a.name === "Payroll")!.id;

  // Budget natively per QBO account: revenue 200k, payroll 80k for the month.
  const budget = await createBudget({ entityId: entity.id, fiscalYear: 2026, label: "FY Original" });
  await saveBudgetLinesBulk(budget.id, [
    { ledgerAccountId: revId, monthly: { "2026-07": 200000 } },
    { ledgerAccountId: payId, monthly: { "2026-07": 80000 } },
  ]);

  const v = await computeVariance({ entityId: entity.id, budgetId: budget.id, periodMonthISO: MONTH, basis: "month" });
  const rev = v.rows.find((r) => r.accountKey === revId)!;
  const pay = v.rows.find((r) => r.accountKey === payId)!;
  console.log(`Revenue: actual=${rev.actual} budget=${rev.budget} var=${rev.varianceAmt} fav=${rev.favorable} section=${rev.type}`);
  console.log(`OpEx:    actual=${pay.actual} budget=${pay.budget} var=${pay.varianceAmt} fav=${pay.favorable} section=${pay.type}`);
  if (rev.actual !== 210000 || rev.budget !== 200000 || rev.varianceAmt !== 10000 || rev.type !== "Revenue") throw new Error("revenue variance wrong");
  if (rev.favorable !== true) throw new Error("revenue over budget should be favorable");
  if (pay.varianceAmt !== 10000 || pay.favorable !== false || pay.type !== "OpEx") throw new Error("opex over budget should be unfavorable");
  if (!rev.material || !pay.material) throw new Error("both variances should be material (>=5000)");
  console.log(`materialRows=${v.materialRows.length} (expect >=2), subtotal Revenue var=${v.subtotals.Revenue?.varianceAmt}`);
  if (v.materialRows.length < 2) throw new Error("expected material rows");
  if (v.subtotals.Revenue?.varianceAmt !== 10000) throw new Error("section subtotal wrong");

  // Lock blocks edits.
  await setBudgetStatus(budget.id, true);
  const locked = await saveBudgetLinesBulk(budget.id, [{ ledgerAccountId: revId, monthly: { "2026-07": 999 } }]);
  console.log(`locked save → ok=${locked.ok} (expect false)`);
  if (locked.ok) throw new Error("locked budget should reject edits");

  // Narrative save + read, keyed by account (accountKey = ledgerAccountId).
  await upsertNote({ entityId: entity.id, accountKey: revId, periodMonthISO: MONTH, text: "New engagement closed early.", aiDrafted: false });
  const notes = await notesForMonth(entity.id, MONTH);
  console.log(`note saved: "${notes.get(revId)?.text}"`);
  if (!notes.get(revId)) throw new Error("narrative not saved");

  console.log(`\nnarrativesConfigured=${narrativesConfigured()} (AI draft ${narrativesConfigured() ? "available" : "off"})`);

  // General ledger: parse a GeneralLedger report fixture → import → query by
  // source account (the drill path is now ledgerAccountId, not reporting).
  const { parseGeneralLedger } = await import("@/lib/pace/qbo");
  const col = (title: string, type: string) => ({ ColTitle: title, ColType: type, MetaData: [{ Name: "ColKey", Value: type }] });
  const glReport = {
    Columns: {
      Column: [
        col("Date", "tx_date"),
        col("Transaction Type", "txn_type"),
        col("Num", "doc_num"),
        col("Name", "name"),
        col("Memo", "memo"),
        col("Split", "split_acc"),
        col("Amount", "subt_nat_amount"),
        col("Balance", "rbal_nat_amount"),
      ],
    },
    Rows: {
      Row: [
        {
          Header: { ColData: [{ value: "Consulting Income", id: "82" }] },
          Rows: {
            Row: [
              { type: "Data", ColData: [{ value: "2026-07-05" }, { value: "Invoice", id: "1001" }, { value: "1001" }, { value: "Client A", id: "11" }, { value: "July services" }, { value: "Accounts Receivable" }, { value: "-15000.00" }, { value: "-15000.00" }] },
              { type: "Data", ColData: [{ value: "2026-07-20" }, { value: "Invoice", id: "1002" }, { value: "1002" }, { value: "Client B" }, { value: "" }, { value: "Accounts Receivable" }, { value: "-5,000.00" }, { value: "-20000.00" }] },
            ],
          },
        },
      ],
    },
  };
  const glLines = parseGeneralLedger(glReport);
  const glTotal = glLines.reduce((s, l) => s + l.amount, 0);
  console.log(`parseGeneralLedger → ${glLines.length} lines, acct ${glLines[0]?.externalAccountId}, total $${glTotal}, type "${glLines[0]?.txnType}"`);
  if (glLines.length !== 2 || glLines[0].externalAccountId !== "82" || glTotal !== -20000 || glLines[1].amount !== -5000) {
    throw new Error("parseGeneralLedger output wrong");
  }

  // Import + query round-trip: a source account (externalId 82), QBO Income type.
  const { importGeneralLedger, queryGeneralLedger, glMonths } = await import("@/lib/pace/gl");
  const glAcct = await prisma.ledgerAccount.create({
    data: { entityId: entity.id, externalId: "82", name: "Consulting Income", acctNum: "4010", sourceType: "Income" },
  });
  const glImp = await importGeneralLedger({ entityId: entity.id, periodMonthISO: MONTH, lines: glLines });
  console.log(`importGeneralLedger → count=${glImp.count} unresolved=${glImp.unresolved}`);
  if (glImp.count !== 2 || glImp.unresolved !== 0) throw new Error("GL import did not resolve accounts");
  const glQ = await queryGeneralLedger({ entityId: entity.id, ledgerAccountId: glAcct.id, fromMonth: "2026-07", toMonth: "2026-07" });
  console.log(`queryGeneralLedger(source acct) → ${glQ.count} rows, total $${glQ.total}, type "${glQ.rows[0]?.accountType}"`);
  if (glQ.count !== 2 || glQ.total !== -20000) throw new Error("GL query by source account wrong");
  if (glQ.rows[0]?.accountType !== "Income") throw new Error("GL row should carry QBO account type");
  // Idempotent: re-import the same month replaces (still 2, not 4).
  await importGeneralLedger({ entityId: entity.id, periodMonthISO: MONTH, lines: glLines });
  const glQ2 = await queryGeneralLedger({ entityId: entity.id, ledgerAccountId: glAcct.id });
  if (glQ2.count !== 2) throw new Error("GL re-import should replace the month, not duplicate");
  const gm = await glMonths(entity.id);
  console.log(`glMonths → ${gm.join(", ")} (expect 2026-07)`);
  if (gm[0] !== "2026-07") throw new Error("glMonths wrong");

  // Delete budget: locked → blocked, unlocked → removed (lines cascade).
  const delLocked = await deleteBudget(budget.id);
  console.log(`delete while locked → ok=${delLocked.ok} (expect false)`);
  if (delLocked.ok) throw new Error("locked budget should not delete");
  await setBudgetStatus(budget.id, false);
  const delOk = await deleteBudget(budget.id);
  const stillThere = await prisma.budget.findUnique({ where: { id: budget.id } });
  const orphanLines = await prisma.budgetLine.count({ where: { budgetId: budget.id } });
  console.log(`delete after unlock → ok=${delOk.ok}, budget gone=${!stillThere}, orphan lines=${orphanLines}`);
  if (!delOk.ok || stillThere || orphanLines !== 0) throw new Error("budget delete did not cascade");

  await prisma.entity.delete({ where: { id: entity.id } }).catch(() => {});
  console.log("cleaned up throwaway entity");
  console.log("\n✅ PACE Phase 2 (QBO-native BvA) smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
