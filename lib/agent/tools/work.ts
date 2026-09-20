import { prisma } from "@/lib/prisma";
import { type AgentTool, safeRevalidate, str, num, usd } from "@/lib/agent/tool-kit";
import { engagementEconomics } from "@/lib/work/capacity";
import { portfolioPnl } from "@/lib/work/pnl";
import { pendingRequests } from "@/lib/work/bookings";
import { logTime } from "@/lib/work/time";

/** Work → Capacity tools — portfolios + P&L, engagements, resources, time. */

const listPortfolios: AgentTool = {
  name: "work_list_portfolios",
  description: "List capacity portfolios (director books): name, director, declared revenue, engagement count.",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const rows = await prisma.portfolio.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { _count: { select: { engagements: true } } } });
    return { ok: true, count: rows.length, portfolios: rows.map((p) => ({ id: p.id, name: p.name, director: p.directorName, declaredRevenue: usd(p.declaredPortfolioRevenueCents), engagements: p._count.engagements })) };
  },
};

const getPortfolioPnl: AgentTool = {
  name: "work_get_portfolio_pnl",
  description: "Get a portfolio's P&L to date: recognized revenue, consumed labor, booked-unused, GP, GP%, live bonus, and the hoarding gauge.",
  mode: "read",
  input_schema: { type: "object", properties: { portfolioId: { type: "string" } }, required: ["portfolioId"] },
  run: async (input) => {
    const id = str(input, "portfolioId");
    if (!id) return { ok: false, error: "portfolioId is required." };
    const p = await portfolioPnl(id);
    if (!p) return { ok: false, error: "Portfolio not found." };
    return {
      ok: true,
      portfolio: p.portfolio.name,
      recognizedRevenue: usd(p.recognizedRevenueCents),
      consumedLabor: usd(p.consumedLaborCents),
      bookedUnused: usd(p.bookedUnusedCents),
      grossProfit: usd(p.grossProfitCents),
      gpPct: p.gpPct == null ? null : Math.round(p.gpPct * 100),
      bonusIfYearEndedToday: usd(p.bonus.payoutCents),
      hoardingBand: p.hoarding.band,
    };
  },
};

const listEngagements: AgentTool = {
  name: "work_list_engagements",
  description: "List capacity engagements (client work items) with portfolio, type, revenue, and status.",
  mode: "read",
  input_schema: { type: "object", properties: { portfolioId: { type: "string", description: "Optional filter." } } },
  run: async (input) => {
    const portfolioId = str(input, "portfolioId");
    const rows = await prisma.portfolioEngagement.findMany({
      where: portfolioId ? { portfolioId } : {},
      orderBy: { clientName: "asc" },
      include: { portfolio: { select: { name: true } } },
      take: 200,
    });
    return { ok: true, count: rows.length, engagements: rows.map((e) => ({ id: e.id, client: e.clientName, portfolio: e.portfolio.name, type: e.engagementType, revenue: usd(e.revenueCents), status: e.status })) };
  },
};

const getEngagement: AgentTool = {
  name: "work_get_engagement",
  description: "Get an engagement's economics: budget vs booked vs consumed hours by role band, recognized revenue, consumed cost, GP, and burn %.",
  mode: "read",
  input_schema: { type: "object", properties: { engagementId: { type: "string" } }, required: ["engagementId"] },
  run: async (input) => {
    const id = str(input, "engagementId");
    if (!id) return { ok: false, error: "engagementId is required." };
    const e = await engagementEconomics(id);
    if (!e) return { ok: false, error: "Engagement not found." };
    return {
      ok: true,
      client: e.clientName,
      contractRevenue: usd(e.revenueCents),
      recognizedRevenue: usd(e.recognizedRevenueCents),
      consumedCost: usd(e.totals.consumedCostCents),
      grossProfit: usd(e.grossProfitCents),
      burnPct: e.burnPct == null ? null : Math.round(e.burnPct * 100),
      byBand: e.lines.map((l) => ({ band: l.band, budgeted: l.budgetedHours, booked: l.bookedHours, consumed: l.consumedHours })),
    };
  },
};

const listResources: AgentTool = {
  name: "work_list_resources",
  description: "List active pool resources: name, email, role band, weekly capacity, cost-exempt (director) flag.",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const rows = await prisma.poolResource.findMany({ where: { active: true }, orderBy: { personName: "asc" }, include: { roleBand: { select: { name: true } } } });
    return { ok: true, count: rows.length, resources: rows.map((r) => ({ id: r.id, name: r.personName, email: r.email, band: r.roleBand.name, capacity: Number(r.weeklyCapacityHours), director: r.costExempt })) };
  },
};

const listPending: AgentTool = {
  name: "work_list_pending_bookings",
  description: "List capacity booking requests awaiting broker confirmation, with overbook / over-budget flags.",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async () => {
    const rows = await pendingRequests();
    return { ok: true, count: rows.length, requests: rows.map((r) => ({ id: r.id, resource: r.resource, week: r.isoWeek, engagement: r.engagement, hours: r.hours, wouldOverbook: r.wouldOverbook, overBudget: r.overBudgetAck })) };
  },
};

const logTimeTool: AgentTool = {
  name: "work_log_time",
  description: "Log time for a pool resource against an engagement on a date. Hours roll up into the engagement's consumed hours + cost.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      resourceId: { type: "string" },
      engagementId: { type: "string" },
      workDate: { type: "string", description: "YYYY-MM-DD" },
      hours: { type: "number" },
      notes: { type: "string" },
    },
    required: ["resourceId", "engagementId", "workDate", "hours"],
  },
  confirmSummary: (i) => `Log ${num(i, "hours")}h for resource ${str(i, "resourceId")} on engagement ${str(i, "engagementId")} (${str(i, "workDate")}).`,
  run: async (input, ctx) => {
    const resourceId = str(input, "resourceId");
    const engagementId = str(input, "engagementId");
    const workDate = str(input, "workDate");
    const hours = num(input, "hours");
    if (!resourceId || !engagementId || !workDate || !hours) return { ok: false, error: "resourceId, engagementId, workDate, and hours are required." };
    const res = await logTime({ resourceId, engagementId, workDate, hours, notes: str(input, "notes") ?? null, createdBy: ctx.userId });
    if (res.ok) {
      safeRevalidate("/work/capacity/time");
      safeRevalidate(`/work/capacity/engagements/${engagementId}`);
    }
    return res;
  },
};

export const WORK_TOOLS: AgentTool[] = [
  listPortfolios,
  getPortfolioPnl,
  listEngagements,
  getEngagement,
  listResources,
  listPending,
  logTimeTool,
];
