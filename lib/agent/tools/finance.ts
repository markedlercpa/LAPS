import { prisma } from "@/lib/prisma";
import { type AgentTool, safeRevalidate, str, usd } from "@/lib/agent/tool-kit";
import { listReportingAccounts, unmappedAccounts, mapAccount, ensureReportingCoaSeeded } from "@/lib/pace/coa";
import { buildStatement, availableMonths } from "@/lib/pace/statements";
import { buildDirectForecast, buildIndirectForecast } from "@/lib/pace/cash";
import { qboConfigured, syncLedgerAccounts } from "@/lib/pace/qbo";

/**
 * Finance (PACE) tools — entities, the reporting chart of accounts + the
 * COA-mapping exception queue, statements, budgets, and the cash forecast.
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

const listReportingCoa: AgentTool = {
  name: "finance_list_reporting_coa",
  description:
    "List the firm-standard reporting chart of accounts (the mapping targets): code, name, statement (IS/BS), and type. Use to find the reportingAccountId or code to map a source account to.",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const accts = await listReportingAccounts();
    return {
      ok: true,
      count: accts.length,
      accounts: accts.map((a) => ({ id: a.id, code: a.code, name: a.name, statement: a.statement, type: a.type })),
    };
  },
};

const listUnmappedAccounts: AgentTool = {
  name: "finance_list_unmapped_accounts",
  description:
    "List source ledger accounts that are NOT yet mapped to the reporting COA (the exception queue). Returns id, account number, name, and entity. These are what map_account resolves.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { entityId: { type: "string", description: "Optional entity filter." } },
  },
  run: async (input) => {
    const rows = await unmappedAccounts(str(input, "entityId"));
    return {
      ok: true,
      count: rows.length,
      accounts: rows.map((a) => ({ id: a.id, acctNum: a.acctNum, name: a.name, entity: a.entity.name })),
    };
  },
};

const mapAccountTool: AgentTool = {
  name: "finance_map_account",
  description:
    "Map a source ledger account to a reporting-COA account (resolves an exception-queue item). Give the source ledgerAccountId (from finance_list_unmapped_accounts) and EITHER a reportingAccountId or a reportingCode (e.g. '4000'). Pass reportingCode 'none' to unmap.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      ledgerAccountId: { type: "string", description: "Source account id." },
      reportingAccountId: { type: "string", description: "Target reporting account id (or use reportingCode)." },
      reportingCode: { type: "string", description: "Target reporting account code, e.g. '4000'. 'none' unmaps." },
    },
    required: ["ledgerAccountId"],
  },
  confirmSummary: (i) =>
    `Map source account ${str(i, "ledgerAccountId")} → reporting ${str(i, "reportingCode") ?? str(i, "reportingAccountId") ?? "?"}.`,
  run: async (input) => {
    await ensureReportingCoaSeeded();
    const ledgerAccountId = str(input, "ledgerAccountId");
    if (!ledgerAccountId) return { ok: false, error: "ledgerAccountId is required." };
    let reportingAccountId: string | null = str(input, "reportingAccountId") ?? null;
    const code = str(input, "reportingCode");
    if (code && code.toLowerCase() === "none") reportingAccountId = null;
    else if (!reportingAccountId && code) {
      const ra = await prisma.reportingAccount.findUnique({ where: { code }, select: { id: true } });
      if (!ra) return { ok: false, error: `No reporting account with code ${code}.` };
      reportingAccountId = ra.id;
    }
    const acct = await prisma.ledgerAccount.findUnique({ where: { id: ledgerAccountId }, select: { id: true } });
    if (!acct) return { ok: false, error: "Source ledger account not found." };
    await mapAccount(ledgerAccountId, reportingAccountId);
    safeRevalidate("/finance/mapping");
    safeRevalidate("/finance/actuals");
    return { ok: true, ledgerAccountId, reportingAccountId };
  },
};

const syncAccounts: AgentTool = {
  name: "finance_sync_qbo_accounts",
  description:
    "Pull the QuickBooks chart of accounts (with account numbers) into the mapping queue for every QBO-connected entity, so unmapped accounts appear for mapping. No-op if QBO isn't configured.",
  mode: "write",
  input_schema: { type: "object", properties: {} },
  confirmSummary: () => "Sync the QuickBooks chart of accounts into the mapping queue.",
  run: async () => {
    if (!qboConfigured()) return { ok: false, error: "QuickBooks is not configured." };
    const conns = await prisma.ledgerConnection.findMany({ where: { provider: "QBO", status: "connected" }, select: { entityId: true } });
    if (conns.length === 0) return { ok: false, error: "No QBO-connected entities." };
    let synced = 0;
    for (const c of conns) synced += (await syncLedgerAccounts(c.entityId)) ?? 0;
    safeRevalidate("/finance/mapping");
    return { ok: true, synced };
  },
};

const getStatement: AgentTool = {
  name: "finance_get_statement",
  description:
    "Get a financial statement (income statement or balance sheet) for an entity (or consolidated) and month, rolled up through the reporting COA. Month is 'YYYY-MM'; omit for the latest loaded month.",
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
      unmappedAmount: s.unmappedAmount,
      lines: s.lines.map((l) => ({ code: l.code, name: l.name, amount: l.amount })),
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
  listReportingCoa,
  listUnmappedAccounts,
  getStatement,
  listBudgets,
  getCashForecast,
  mapAccountTool,
  syncAccounts,
];
