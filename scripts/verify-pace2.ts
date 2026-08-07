/**
 * Throwaway smoke test for PACE Phase 2 (Expectations). Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-pace2.ts
 */
import { prisma } from "@/lib/prisma";
import { ensureReportingCoaSeeded } from "@/lib/pace/coa";
import { importTrialBalance } from "@/lib/pace/import";
import { createBudget, saveBudgetLinesBulk, setBudgetStatus, deleteBudget } from "@/lib/pace/budgets";
import { computeVariance } from "@/lib/pace/variance";
import { upsertNote, notesForMonth, narrativesConfigured } from "@/lib/pace/narratives";

const MONTH = "2026-07-01";

async function main() {
  await ensureReportingCoaSeeded();
  const ra = await prisma.reportingAccount.findMany({ select: { id: true, code: true } });
  const byCode = new Map(ra.map((r) => [r.code, r.id]));
  const revId = byCode.get("4100") as string;
  const payId = byCode.get("6000") as string;

  const entity = await prisma.entity.create({ data: { name: "ZZZ P2 Co", connection: { create: {} } } });

  // Actuals: revenue 210k, payroll 90k (balanced with cash 120k).
  await importTrialBalance({
    entityId: entity.id,
    periodMonth: MONTH,
    rows: [
      { name: "Cash", amount: 120000, reportingCode: "1000" },
      { name: "Revenue", amount: -210000, reportingCode: "4100" },
      { name: "Payroll", amount: 90000, reportingCode: "6000" },
    ],
  });

  // Budget: revenue 200k, payroll 80k for the month.
  const budget = await createBudget({ entityId: entity.id, fiscalYear: 2026, label: "FY Original" });
  await saveBudgetLinesBulk(budget.id, [
    { reportingAccountId: revId, monthly: { "2026-07": 200000 } },
    { reportingAccountId: payId, monthly: { "2026-07": 80000 } },
  ]);

  const v = await computeVariance({ entityId: entity.id, budgetId: budget.id, periodMonthISO: MONTH, basis: "month" });
  const rev = v.rows.find((r) => r.reportingAccountId === revId)!;
  const pay = v.rows.find((r) => r.reportingAccountId === payId)!;
  console.log(`revenue: actual=${rev.actual} budget=${rev.budget} var=${rev.varianceAmt} fav=${rev.favorable} material=${rev.material}`);
  console.log(`payroll: actual=${pay.actual} budget=${pay.budget} var=${pay.varianceAmt} fav=${pay.favorable} material=${pay.material}`);
  if (rev.actual !== 210000 || rev.budget !== 200000 || rev.varianceAmt !== 10000) throw new Error("revenue variance wrong");
  if (rev.favorable !== true) throw new Error("revenue over budget should be favorable");
  if (pay.varianceAmt !== 10000 || pay.favorable !== false) throw new Error("payroll over budget should be unfavorable");
  if (!rev.material || !pay.material) throw new Error("both variances should be material (>=5000)");
  console.log(`materialRows=${v.materialRows.length} (expect >=2)`);
  if (v.materialRows.length < 2) throw new Error("expected material rows");

  // Lock blocks edits.
  await setBudgetStatus(budget.id, true);
  const locked = await saveBudgetLinesBulk(budget.id, [{ reportingAccountId: revId, monthly: { "2026-07": 999 } }]);
  console.log(`locked save → ok=${locked.ok} (expect false)`);
  if (locked.ok) throw new Error("locked budget should reject edits");

  // Narrative save + read.
  await upsertNote({ entityId: entity.id, reportingAccountId: revId, periodMonthISO: MONTH, text: "New engagement closed early.", aiDrafted: false });
  const notes = await notesForMonth(entity.id, MONTH);
  console.log(`note saved: "${notes.get(revId)?.text}"`);
  if (!notes.get(revId)) throw new Error("narrative not saved");

  console.log(`\nnarrativesConfigured=${narrativesConfigured()} (AI draft ${narrativesConfigured() ? "available" : "off"})`);

  // QBO budget parser (pure — no network): a sample query response → lines.
  const { parseQboBudgets } = await import("@/lib/pace/qbo");
  const parsed = parseQboBudgets({
    QueryResponse: {
      Budget: [
        {
          Name: "FY2026 Plan",
          BudgetDetail: [
            // Numeric, string-with-commas, and plain-string amounts must all coerce.
            { BudgetDate: "2026-01-01", Amount: 15000, AccountRef: { value: "82", name: "Consulting Income" } },
            { BudgetDate: "2026-02-01", Amount: "16,000", AccountRef: { value: "82", name: "Consulting Income" } },
            { BudgetDate: "2026-01-01", Amount: "7000", AccountRef: { value: "60", name: "Payroll" } },
          ],
        },
      ],
    },
  });
  const total = parsed[0]?.lines.reduce((s, l) => s + l.amount, 0) ?? 0;
  console.log(`parseQboBudgets → ${parsed.length} budget(s), "${parsed[0]?.name}", ${parsed[0]?.lines.length} lines, first month ${parsed[0]?.lines[0]?.month}, total $${total}`);
  if (parsed.length !== 1 || parsed[0].lines.length !== 3 || parsed[0].lines[0].month !== "2026-01") {
    throw new Error("QBO budget parser output wrong");
  }
  if (total !== 38000) throw new Error(`QBO budget amounts not coerced (expected 38000, got ${total})`);

  // General ledger: parse a GeneralLedger report fixture → import → query.
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

  // Import + query round-trip: a source account (externalId 82) mapped to revenue.
  const { importGeneralLedger, queryGeneralLedger, glMonths } = await import("@/lib/pace/gl");
  await prisma.ledgerAccount.create({
    data: { entityId: entity.id, externalId: "82", name: "Consulting Income", acctNum: "4010", mappedReportingAccountId: revId },
  });
  const glImp = await importGeneralLedger({ entityId: entity.id, periodMonthISO: MONTH, lines: glLines });
  console.log(`importGeneralLedger → count=${glImp.count} unresolved=${glImp.unresolved}`);
  if (glImp.count !== 2 || glImp.unresolved !== 0) throw new Error("GL import did not resolve accounts");
  const glQ = await queryGeneralLedger({ entityId: entity.id, reportingAccountId: revId, fromMonth: "2026-07", toMonth: "2026-07" });
  console.log(`queryGeneralLedger(revenue) → ${glQ.count} rows, total $${glQ.total}, first "${glQ.rows[0]?.name}"`);
  if (glQ.count !== 2 || glQ.total !== -20000) throw new Error("GL query by reporting account wrong");
  // Idempotent: re-import the same month replaces (still 2, not 4).
  await importGeneralLedger({ entityId: entity.id, periodMonthISO: MONTH, lines: glLines });
  const glQ2 = await queryGeneralLedger({ entityId: entity.id, reportingAccountId: revId });
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
  console.log("\n✅ PACE Phase 2 smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
