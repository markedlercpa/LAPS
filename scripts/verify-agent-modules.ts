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
  const expect = ["list_leads", "finance_list_reporting_coa", "finance_map_account", "work_list_portfolios", "work_log_time", "marketing_list_evidence", "delivery_list_engagements"];
  for (const n of expect) if (!names.includes(n)) throw new Error(`missing tool ${n}`);
  console.log(`registry: ${AGENT_TOOLS.length} tools across modules`);

  // Reporting COA read.
  const coa = await TOOLS_BY_NAME.finance_list_reporting_coa.run({}, ctx);
  console.log(`finance_list_reporting_coa → ${coa.count} accounts`);
  if (!coa.ok || Number(coa.count) < 20) throw new Error("reporting COA not seeded");

  // Cash forecast read (works with no data).
  const cash = await TOOLS_BY_NAME.finance_get_cash_forecast.run({ horizon: "13week" }, ctx);
  if (!cash.ok) throw new Error("cash forecast tool failed");
  console.log(`finance_get_cash_forecast → beginning ${cash.beginning}`);

  // COA mapping round-trip: create a source account, map it by code, verify, cleanup.
  const entity = await prisma.entity.create({ data: { name: "ZZZ Agent Co", connection: { create: {} } } });
  const acct = await prisma.ledgerAccount.create({ data: { entityId: entity.id, externalId: "AGT-1", name: "Consulting Income", acctNum: "4001" } });

  const unmapped = await TOOLS_BY_NAME.finance_list_unmapped_accounts.run({ entityId: entity.id }, ctx);
  console.log(`finance_list_unmapped_accounts → ${unmapped.count} (expect >=1)`);
  if (Number(unmapped.count) < 1) throw new Error("new account should be unmapped");

  const mapped = await TOOLS_BY_NAME.finance_map_account.run({ ledgerAccountId: acct.id, reportingCode: "4000" }, ctx);
  console.log(`finance_map_account → ok=${mapped.ok}`);
  if (!mapped.ok) throw new Error(`map failed: ${mapped.error}`);
  const check = await prisma.ledgerAccount.findUnique({ where: { id: acct.id }, include: { reportingAccount: { select: { code: true } } } });
  if (check?.reportingAccount?.code !== "4000") throw new Error("account not mapped to 4000");
  console.log(`  → ${check?.name} now maps to ${check?.reportingAccount?.code}`);

  // work_list_portfolios read.
  const pf = await TOOLS_BY_NAME.work_list_portfolios.run({}, ctx);
  if (!pf.ok) throw new Error("work_list_portfolios failed");
  console.log(`work_list_portfolios → ${pf.count} portfolios`);

  await prisma.entity.delete({ where: { id: entity.id } }).catch(() => {});
  console.log("cleaned up throwaway entity");
  console.log("\n✅ Agent module tools smoke passed");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
