import { prisma } from "@/lib/prisma";
import { type AgentTool, safeRevalidate, str, usd } from "@/lib/agent/tool-kit";
import { buildStatement, availableMonths } from "@/lib/pace/statements";
import { buildDirectForecast, buildIndirectForecast } from "@/lib/pace/cash";
import { qboConfigured, syncLedgerAccounts } from "@/lib/pace/qbo";

/**
 * Finance (PACE) tools — entities, statements (rebuilt natively from the
 * QuickBooks chart of accounts, no mapping), the reporting COA (budget
 * dimension), budgets, and the cash forecast.
 */

const listEntities: AgentTool = {
  name: "finance_list_entities",
  description: "List Finance entities (companies) with their ledger connection status (QBO/manual).",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const entities = await prisma.entity.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      include: { connection: { select: { provider: true, status: true } } },
    });
    return {
      ok: true,
      count: entities.length,
      entities: entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, provider: e.connection?.provider ?? "MANUAL", status: e.connection?.status ?? "disconnected" })),
    };
  },
};

const syncAccounts: AgentTool = {
  name: "finance_sync_qbo_accounts",
  description:
    "Refresh the QuickBooks chart of accounts (account numbers + AccountType/SubType/Classification + hierarchy) for every QBO-connected entity. This descriptive metadata is what the statements are built from. No-op if QBO isn't configured.",
  mode: "write",
  input_schema: { type: "object", properties: {} },
  confirmSummary: () => "Refresh the QuickBooks chart of accounts (descriptive metadata) for connected entities.",
  run: async () => {
    if (!qboConfigured()) return { ok: false, error: "QuickBooks is not configured." };
    const conns = await prisma.ledgerConnection.findMany({ where: { provider: "QBO", status: "connected" }, select: { entityId: true } });
    if (conns.length === 0) return { ok: false, error: "No QBO-connected entities." };
    let synced = 0;
    for (const c of conns) synced += (await syncLedgerAccounts(c.entityId)) ?? 0;
    safeRevalidate("/finance/actuals");
    return { ok: true, synced };
  },
};

const getStatement: AgentTool = {
  name: "finance_get_statement",
  description:
    "Get a financial statement (income statement or balance sheet) for an entity (or consolidated) and month, rebuilt natively from the QuickBooks chart of accounts. Month is 'YYYY-MM'; omit for the latest loaded month.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: {
      statement: { type: "string", enum: ["IS", "BS"], description: "Income statement or balance sheet." },
      entityId: { type: "string", description: "Entity id; omit or 'all' for consolidated." },
      month: { type: "string", description: "YYYY-MM; omit for the latest month." },
    },
    required: ["statement"],
  },
  run: async (input) => {
    const statement = str(input, "statement") === "BS" ? "BS" : "IS";
    const months = await availableMonths();
    if (months.length === 0) return { ok: false, error: "No trial balances loaded yet." };
    const monthReq = str(input, "month");
    const month = monthReq ? (months.find((m) => m.startsWith(monthReq)) ?? months[0]) : months[0];
    const entityId = str(input, "entityId");
    const consolidated = !entityId || entityId === "all";
    const s = await buildStatement(consolidated ? null : entityId, month, statement);
    return {
      ok: true,
      statement,
      month: month.slice(0, 7),
      consolidated,
      subtotals: s.subtotals,
      unclassifiedAmount: s.unclassifiedAmount,
      sections: s.groups.map((g) => ({
        section: g.label,
        subtotal: g.subtotal,
        lines: g.lines.map((l) => ({ acctNum: l.acctNum, name: l.name, accountType: l.accountType, amount: l.amount })),
      })),
    };
  },
};

const listBudgets: AgentTool = {
  name: "finance_list_budgets",
  description: "List Finance budgets (entity, fiscal year, label, kind, status, line count).",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const budgets = await prisma.budget.findMany({
      orderBy: [{ fiscalYear: "desc" }, { createdAt: "asc" }],
      include: { entity: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return {
      ok: true,
      count: budgets.length,
      budgets: budgets.map((b) => ({ id: b.id, entity: b.entity.name, fiscalYear: b.fiscalYear, label: b.label, kind: b.kind, status: b.status, lines: b._count.lines })),
    };
  },
};

const getCashForecast: AgentTool = {
  name: "finance_get_cash_forecast",
  description:
    "Summarize the cash forecast for a horizon: '14day' (daily), '13week' (weekly), or '12month' (indirect from budgets). Returns beginning/ending cash, lowest point, and per-period endings.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { horizon: { type: "string", enum: ["14day", "13week", "12month"], description: "Default 13week." } },
  },
  run: async (input) => {
    const h = str(input, "horizon");
    if (h === "12month") {
      const f = await buildIndirectForecast();
      return {
        ok: true,
        horizon: "12month",
        beginning: usd(f.opening.cents),
        openingSource: f.opening.auto ? "QB ledger" : "manual",
        endingByMonth: f.columns.map((c, i) => ({ month: c.date, ending: usd(f.ending[i]) })),
      };
    }
    const mode = h === "14day" ? "daily" : "weekly";
    const f = await buildDirectForecast(mode);
    return {
      ok: true,
      horizon: h === "14day" ? "14day" : "13week",
      beginning: usd(f.opening.cents),
      openingSource: f.opening.auto ? "QB ledger" : "manual",
      lowestEnding: usd(Math.min(...f.ending)),
      lowestLiquidity: usd(Math.min(...f.loc.totalLiquidity)),
      endingByPeriod: f.columns.map((c, i) => ({ period: c.date, ending: usd(f.ending[i]) })),
    };
  },
};

export const FINANCE_TOOLS: AgentTool[] = [
  listEntities,
  getStatement,
  listBudgets,
  getCashForecast,
  syncAccounts,
];
