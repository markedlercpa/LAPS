/**
 * Smoke for the cross-module agent tools. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-agent-modules.ts
 */
import { prisma } from "@/lib/prisma";
import { AGENT_TOOLS, TOOLS_BY_NAME } from "@/lib/agent/tools";
import type { AgentContext } from "@/lib/agent/tool-kit";

const ctx: AgentContext = { userId: "test-agent", role: "ADMIN", email: "test@example.com" };

async function main() {
  // Registry spans all modules.
  const names = AGENT_TOOLS.map((t) => t.name);
  const expect = ["list_leads", "finance_list_reporting_coa", "finance_get_statement", "work_list_portfolios", "work_log_time", "marketing_list_evidence", "delivery_list_engagements"];
  for (const n of expect) if (!names.includes(n)) throw new Error(`missing tool ${n}`);
  // The manual-mapping tools are gone under the QBO-native rebuild.
  for (const gone of ["finance_map_account", "finance_list_unmapped_accounts"]) {
    if (names.includes(gone)) throw new Error(`tool ${gone} should have been removed`);
  }
  console.log(`registry: ${AGENT_TOOLS.length} tools across modules`);

  // Reporting COA read (still the budgeting dimension).
  const coa = await TOOLS_BY_NAME.finance_list_reporting_coa.run({}, ctx);
  console.log(`finance_list_reporting_coa → ${coa.count} accounts`);
  if (!coa.ok || Number(coa.count) < 20) throw new Error("reporting COA not seeded");

  // Cash forecast read (works with no data).
  const cash = await TOOLS_BY_NAME.finance_get_cash_forecast.run({ horizon: "13week" }, ctx);
  if (!cash.ok) throw new Error("cash forecast tool failed");
  console.log(`finance_get_cash_forecast → beginning ${cash.beginning}`);

  // Statement read: import a native (QBO-typed) TB → the P&L rebuilds with no mapping.
  const { importTrialBalance } = await import("@/lib/pace/import");
  const entity = await prisma.entity.create({ data: { name: "ZZZ Agent Co", connection: { create: {} } } });
  await importTrialBalance({
    entityId: entity.id,
    periodMonth: "2026-07-01",
    rows: [
      { name: "Checking", amount: 90000, accountType: "Bank" },
      { name: "Consulting Income", amount: -90000, accountType: "Income" },
    ],
  });
  const stmt = await TOOLS_BY_NAME.finance_get_statement.run({ statement: "IS", entityId: entity.id }, ctx);
  console.log(`finance_get_statement → ok=${stmt.ok} sections=${(stmt.sections as unknown[])?.length}`);
  if (!stmt.ok || (stmt.subtotals as { revenue: number }).revenue !== 90000) throw new Error("statement did not rebuild natively");

  // work_list_portfolios read.
  const pf = await TOOLS_BY_NAME.work_list_portfolios.run({}, ctx);
  if (!pf.ok) throw new Error("work_list_portfolios failed");
  console.log(`work_list_portfolios → ${pf.count} portfolios`);

  await prisma.entity.delete({ where: { id: entity.id } }).catch(() => {});
  console.log("cleaned up throwaway entity");
  console.log("\n✅ Agent module tools smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
