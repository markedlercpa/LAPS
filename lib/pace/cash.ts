import { prisma } from "@/lib/prisma";
import { isoWeekOf, isoWeekStart } from "@/lib/work-taxonomy";
import { rateForBandWeek } from "@/lib/work/capacity";
import { latestBankCashCents, buildStatement } from "@/lib/pace/statements";
import { classifyAccount } from "@/lib/pace/qbo-taxonomy";
import { qboConfigured, pullArAging, pullApAging, type AgingItem } from "@/lib/pace/qbo";
import { agingItemKey, effectiveAgingDate, getAgingOverrides, type AgingKind, type AgingOverride } from "@/lib/pace/aging";
import { CASH_CATEGORY_MAP, categoriesFor, type CashMode } from "@/lib/pace/cash-taxonomy";

/**
 * Cash forecasting — three models, all firm-level, off data internal to Pulse:
 *   • 14-day daily   (direct, categorized)
 *   • 13-week weekly (direct, categorized)
 *   • 12-month       (indirect 3-statement: P&L from budgets → EBITDA → net
 *                     income → GAAP cash flow)
 *
 * Beginning cash is pulled automatically from the QB ledgers (latest
 * balance-sheet cash). Category rows are auto-fed where Pulse has the data
 * (signed/won proposal payments → project receipts; committed capacity labor +
 * director base → payroll) and layered with manual assumption lines.
 */

// ── Date / bucket helpers ────────────────────────────────────────────────────
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mmddyy(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", timeZone: "UTC" });
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function addMonths(d: Date, k: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m + k, Math.min(d.getUTCDate(), daysInMonth(y, m + k))));
}
function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export type Column = { num: number; date: string; sub: string; key: string; actual: boolean };

/** `back` trailing actual periods + `fwd` forecast periods. num is negative for
 * actuals (…-2, -1) and 1-based for the forecast, so the split reads at a glance. */
function dailyColumns(back: number, fwd: number): Column[] {
  const origin = todayUtc();
  const start = new Date(origin);
  start.setUTCDate(origin.getUTCDate() - back);
  return Array.from({ length: back + fwd }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { num: i - back + 1, date: mmddyy(d), sub: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), key: ymd(d), actual: i < back };
  });
}
function weeklyColumns(back: number, fwd: number): Column[] {
  const origin = isoWeekStart(isoWeekOf(new Date()));
  const start = new Date(origin);
  start.setUTCDate(origin.getUTCDate() - back * 7);
  return Array.from({ length: back + fwd }, (_, i) => {
    const mon = new Date(start);
    mon.setUTCDate(start.getUTCDate() + i * 7);
    const fri = new Date(mon);
    fri.setUTCDate(mon.getUTCDate() + 4);
    return { num: i - back + 1, date: mmddyy(fri), sub: mmddyy(mon), key: isoWeekOf(mon), actual: i < back };
  });
}
function monthlyColumns(back: number, fwd: number): Column[] {
  const first = new Date(Date.UTC(todayUtc().getUTCFullYear(), todayUtc().getUTCMonth(), 1));
  const start = addMonths(first, -back);
  return Array.from({ length: back + fwd }, (_, i) => {
    const s = addMonths(start, i);
    const key = `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
    return { num: i - back + 1, date: s.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), sub: "", key, actual: i < back };
  });
}

/** Which column index a date falls in, by mode. -1 if outside the horizon. */
function columnIndexForDate(cols: Column[], mode: CashMode, d: Date): number {
  if (mode === "daily") return cols.findIndex((c) => c.key === ymd(d));
  if (mode === "weekly") return cols.findIndex((c) => c.key === isoWeekOf(d));
  const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return cols.findIndex((c) => c.key === mk);
}

// ── Manual-line occurrence expansion ─────────────────────────────────────────
type LineLite = { category: string; amountCents: number; cadence: string; startDate: Date; endDate: Date | null };
function occurrences(line: LineLite, h0: Date, hN: Date): Date[] {
  const out: Date[] = [];
  const end = line.endDate && line.endDate.getTime() < hN.getTime() ? line.endDate : hN;
  if (line.cadence === "ONE_TIME") {
    if (line.startDate >= h0 && line.startDate <= hN) out.push(line.startDate);
    return out;
  }
  const step = line.cadence === "WEEKLY" ? 7 : line.cadence === "BIWEEKLY" ? 14 : 0;
  let cur = new Date(line.startDate);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard++ < 800) {
    if (cur >= h0) out.push(new Date(cur));
    cur = step ? new Date(cur.getTime() + step * 86_400_000) : addMonths(cur, 1);
  }
  return out;
}

// ── Opening cash (auto from QB ledgers) ──────────────────────────────────────
/** Latest consolidated cash = sum of QBO Bank-type accounts, in cents. */
export async function latestCashActualCents(): Promise<{ cents: number; asOf: string } | null> {
  return latestBankCashCents();
}

async function effectiveOpening(config: Awaited<ReturnType<typeof getCashConfig>>): Promise<{ cents: number; auto: boolean; asOf: string | null }> {
  if (!config || config.useQboOpening) {
    const actual = await latestCashActualCents();
    if (actual) return { cents: actual.cents, auto: true, asOf: actual.asOf };
  }
  return { cents: config?.openingCents ?? 0, auto: false, asOf: config?.openingAsOf ? ymd(config.openingAsOf) : null };
}

// ── Direct forecast (14-day / 13-week) ───────────────────────────────────────
export type StatementRow = { key: string; label: string; values: number[]; total: number };
export type StatementGroup = { title: string; rows: StatementRow[]; subtotalLabel: string; subtotal: number[]; subtotalTotal: number };
export type CashSources = {
  qboConfigured: boolean;
  qboConnectedEntities: number;
  arParsed: number; // open AR items returned by QBO (before windowing)
  apParsed: number;
  arItems: number; // AR items that landed inside the forecast horizon
  apItems: number;
  arCents: number; // total AR spread into the horizon
  apCents: number; // total AP spread into the horizon
  wipCents: number;
};
export type DirectForecast = {
  mode: CashMode;
  columns: Column[];
  firstFc: number; // index of the first forecast column (columns before it are actuals)
  opening: { cents: number; auto: boolean; asOf: string | null };
  beginning: number[];
  groups: StatementGroup[]; // RECEIPTS, DISBURSEMENTS
  netOperating: StatementRow;
  financing: StatementGroup;
  ending: number[];
  loc: { balance: number[]; availability: number[]; totalLiquidity: number[]; limitCents: number };
  minThreshold: number;
  cushion: number[];
  sources: CashSources;
};

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// Trailing actuals brought into each direct view.
const DAILY_BACK = 7, DAILY_FWD = 14;
const WEEKLY_BACK = 4, WEEKLY_FWD = 13;

function periodStartUtc(col: Column, mode: CashMode): Date {
  if (mode === "daily") return new Date(`${col.key}T00:00:00Z`);
  if (mode === "weekly") return isoWeekStart(col.key);
  return new Date(`${col.key}-01T00:00:00Z`);
}
function periodEndUtc(col: Column, mode: CashMode): Date {
  if (mode === "daily") { const d = new Date(`${col.key}T00:00:00Z`); d.setUTCHours(23, 59, 59); return d; }
  if (mode === "weekly") { const m = isoWeekStart(col.key); const e = new Date(m); e.setUTCDate(m.getUTCDate() + 6); e.setUTCHours(23, 59, 59); return e; }
  return new Date(Date.UTC(Number(col.key.slice(0, 4)), Number(col.key.slice(5, 7)), 0, 23, 59, 59));
}

/**
 * Fill the actual (trailing) columns from real bank-cash movement in the ledger,
 * bucketed coarsely: customer collections → AR Collections, vendor bill payments
 * → AP Payments, payroll → Payroll, everything else in / out → Other Receipts /
 * Other Operating. Net and ending cash are exact regardless of the bucket split.
 */
async function fillActualCash(columns: Column[], firstFc: number, mode: CashMode, cat: Record<string, number[]>): Promise<void> {
  if (firstFc <= 0) return;
  const start = periodStartUtc(columns[0], mode);
  const end = periodEndUtc(columns[firstFc - 1], mode);
  const lines = await prisma.generalLedgerLine.findMany({
    where: { txnDate: { gte: start, lte: end } },
    select: { id: true, externalTxnId: true, txnDate: true, amount: true, ledgerAccount: { select: { sourceType: true, name: true } } },
  });
  // Group a transaction's lines so we can read its counterparty side.
  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    const k = l.externalTxnId ?? `solo:${l.id}`;
    const g = groups.get(k);
    if (g) g.push(l); else groups.set(k, [l]);
  }
  for (const g of groups.values()) {
    let bankDelta = 0;
    const other: { type: string | null; name: string }[] = [];
    for (const l of g) {
      const type = l.ledgerAccount?.sourceType ?? null;
      if (type === "Bank") bankDelta += Number(l.amount);
      else other.push({ type, name: l.ledgerAccount?.name ?? "" });
    }
    if (Math.abs(bankDelta) < 0.005) continue; // no net cash (e.g. inter-bank transfer)
    const i = columnIndexForDate(columns, mode, g[0].txnDate);
    if (i < 0 || i >= firstFc) continue;
    let key: string;
    if (bankDelta > 0) {
      key = other.some((o) => o.type === "Income" || o.type === "Other Income" || o.type === "Accounts Receivable") ? "ar_collections" : "other_receipts";
    } else if (other.some((o) => o.type === "Accounts Payable")) {
      key = "ap_payments";
    } else if (other.some((o) => /payroll|wage|salar/i.test(o.name))) {
      key = "payroll";
    } else {
      key = "other_operating";
    }
    cat[key][i] += Math.round(bankDelta * 100); // bankDelta already signed (in +, out −)
  }
}

export async function buildDirectForecast(mode: "daily" | "weekly"): Promise<DirectForecast> {
  const columns = mode === "daily" ? dailyColumns(DAILY_BACK, DAILY_FWD) : weeklyColumns(WEEKLY_BACK, WEEKLY_FWD);
  const n = columns.length;
  const firstFc = columns.findIndex((c) => !c.actual);
  const fcCount = n - firstFc;
  const fc0 = columns[firstFc];
  // Forecast horizon starts at the first *forecast* period (actuals precede it).
  const h0 = mode === "daily" ? new Date(`${fc0.key}T00:00:00Z`) : isoWeekStart(fc0.key);
  const hN = mode === "daily" ? new Date(`${columns[n - 1].key}T23:59:59Z`) : (() => { const m = isoWeekStart(columns[n - 1].key); m.setUTCDate(m.getUTCDate() + 6); return m; })();

  const zero = () => new Array(n).fill(0);
  const fsum = (a: number[]) => a.slice(firstFc).reduce((s, x) => s + x, 0); // totals = forecast horizon only
  const cat: Record<string, number[]> = {};
  for (const c of Object.keys(CASH_CATEGORY_MAP)) cat[c] = zero();

  /** Column index for a forecast feed — never lands in an actual column. */
  const fcIndex = (d: Date): number => { const i = columnIndexForDate(columns, mode, d); return i >= firstFc ? i : -1; };

  const [config, lines, payments, bookings, portfolios] = await Promise.all([
    getCashConfig(),
    prisma.cashFlowLine.findMany({ where: { active: true } }),
    prisma.proposalPayment.findMany({
      where: { proposal: { status: { in: ["SIGNED", "WON"] } }, dueOn: { not: null } },
      select: { amount: true, dueOn: true },
    }),
    mode === "weekly"
      ? prisma.capacityBooking.findMany({
          where: { isoWeek: { in: columns.map((c) => c.key) }, status: { in: ["CONFIRMED", "CONSUMED_CLOSED"] } },
          include: { resource: { select: { costExempt: true } } },
        })
      : Promise.resolve([] as never[]),
    mode === "weekly" ? prisma.portfolio.findMany({ where: { active: true }, select: { directorCostCentsAnnual: true } }) : Promise.resolve([] as { directorCostCentsAnnual: number }[]),
  ]);

  // Manual lines → their category row (signed). Contractor terms shift each
  // disbursement forward by the net terms (net-15 / net-30); paid-when-paid is
  // modeled as that same forward shift, aligning the payment to when the
  // matching customer cash is expected in.
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
  for (const l of lines) {
    const def = CASH_CATEGORY_MAP[l.category];
    if (!def) continue;
    const shift = l.netTermsDays ?? 0;
    for (const d0 of occurrences({ category: l.category, amountCents: l.amountCents, cadence: l.cadence, startDate: l.startDate, endDate: l.endDate }, h0, hN)) {
      const d = shift ? addDays(d0, shift) : d0;
      const i = fcIndex(d);
      if (i >= 0) cat[l.category][i] += l.amountCents * def.sign;
    }
  }

  // Auto: signed/won proposal payments → QofE & one-time project receipts.
  for (const p of payments) {
    if (!p.dueOn) continue;
    const d = new Date(`${p.dueOn.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const i = fcIndex(d);
    if (i >= 0) cat.qofe_projects[i] += Math.round(Number(p.amount) * 100);
  }

  // Auto (weekly only): committed capacity labor + director base → Payroll.
  if (mode === "weekly") {
    const rateCache = new Map<string, number>();
    for (const b of bookings as { hoursBooked: unknown; resource: { costExempt: boolean }; rateCentsSnapshot: number | null; roleBandId: string; isoWeek: string }[]) {
      const booked = Number(b.hoursBooked);
      if (booked <= 0 || b.resource.costExempt) continue;
      const i = columns.findIndex((c) => c.key === b.isoWeek);
      if (i < firstFc) continue; // forecast weeks only
      let rate = b.rateCentsSnapshot ?? -1;
      if (rate < 0) {
        const key = `${b.roleBandId}|${b.isoWeek}`;
        rate = rateCache.get(key) ?? (await rateForBandWeek(b.roleBandId, b.isoWeek))?.loadedRateCents ?? 0;
        rateCache.set(key, rate);
      }
      cat.payroll[i] += -Math.round(booked * rate); // disbursement (negative)
    }
    const directorAnnual = portfolios.reduce((s, p) => s + p.directorCostCentsAnnual, 0);
    const perWeek = Math.round(directorAnnual / 52);
    for (let i = firstFc; i < n; i++) cat.payroll[i] += -perWeek;
  }

  // Auto: AR / AP aging detail from QBO, spread into collections / disbursements
  // by due date (overdue lands in the first column, beyond-horizon drops off).
  // Auto-fed but overridable — manual assumption lines layer on top.
  const sources: CashSources = { qboConfigured: qboConfigured(), qboConnectedEntities: 0, arParsed: 0, apParsed: 0, arItems: 0, apItems: 0, arCents: 0, apCents: 0, wipCents: 0 };
  // Per-item overrides from the Assumptions worktable: a chosen collection/
  // payment date, or exclude. What you edit there is exactly what spreads here.
  const spreadAging = (
    items: AgingItem[],
    target: string,
    sign: 1 | -1,
    kind: AgingKind,
    entityId: string,
    overrides: Map<string, AgingOverride>,
  ): { items: number; cents: number } => {
    let placed = 0;
    let cents = 0;
    for (const it of items) {
      const ov = overrides.get(agingItemKey(kind, entityId, it));
      if (ov?.excluded) continue;
      const raw = effectiveAgingDate(it, ov);
      const d = raw ? new Date(`${raw}T00:00:00Z`) : h0;
      if (Number.isNaN(d.getTime())) continue;
      const when = d.getTime() < h0.getTime() ? h0 : d; // overdue / open → first forecast period
      const i = columnIndexForDate(columns, mode, when);
      if (i >= firstFc) {
        const c = Math.round(it.amount * 100);
        cat[target][i] += c * sign;
        placed += 1;
        cents += c;
      }
    }
    return { items: placed, cents };
  };
  if (sources.qboConfigured) {
    const [conns, overrides] = await Promise.all([
      prisma.ledgerConnection.findMany({ where: { provider: "QBO", status: "connected" }, select: { entityId: true } }),
      getAgingOverrides(),
    ]);
    sources.qboConnectedEntities = conns.length;
    for (const c of conns) {
      const [ar, ap] = await Promise.all([pullArAging(c.entityId), pullApAging(c.entityId)]);
      if (ar) { sources.arParsed += ar.length; const r = spreadAging(ar, "ar_collections", 1, "AR", c.entityId, overrides); sources.arItems += r.items; sources.arCents += r.cents; }
      if (ap) { sources.apParsed += ap.length; const r = spreadAging(ap, "ap_payments", -1, "AP", c.entityId, overrides); sources.apItems += r.items; sources.apCents += r.cents; }
    }
  }

  // Auto (weekly): WIP → collections. Earned-but-unbilled on active engagements
  // (remaining unrecognized contract revenue) converts to cash across the
  // horizon — an estimate, layered with manual overrides.
  if (mode === "weekly") {
    const engagements = await prisma.portfolioEngagement.findMany({
      where: { status: "active" },
      select: { revenueCents: true, budgets: { select: { budgetedHours: true } }, bookings: { select: { hoursConsumed: true } } },
    });
    let remaining = 0;
    for (const e of engagements) {
      const budget = e.budgets.reduce((s, b) => s + Number(b.budgetedHours), 0);
      const consumed = e.bookings.reduce((s, b) => s + Number(b.hoursConsumed), 0);
      const pctComplete = budget > 0 ? Math.min(1, consumed / budget) : 0;
      remaining += Math.round(e.revenueCents * (1 - pctComplete));
    }
    if (remaining > 0) {
      const perCol = Math.round(remaining / fcCount);
      for (let i = firstFc; i < n; i++) cat.wip_collections[i] += perCol;
      sources.wipCents = perCol * fcCount;
    }
  }

  // Actuals: real bank-cash movement into the trailing columns (coarse buckets).
  await fillActualCash(columns, firstFc, mode, cat);

  const mkGroup = (title: string, section: "RECEIPTS" | "DISBURSEMENTS" | "FINANCING", subtotalLabel: string): StatementGroup => {
    const rows: StatementRow[] = categoriesFor(section).map((c) => ({ key: c.key, label: c.label, values: cat[c.key], total: fsum(cat[c.key]) }));
    const subtotal = zero();
    for (const r of rows) for (let i = 0; i < n; i++) subtotal[i] += r.values[i];
    return { title, rows, subtotalLabel, subtotal, subtotalTotal: fsum(subtotal) };
  };
  const receipts = mkGroup("RECEIPTS", "RECEIPTS", "Total Receipts");
  const disbursements = mkGroup("DISBURSEMENTS", "DISBURSEMENTS", "Total Disbursements");
  const financing = mkGroup("FINANCING", "FINANCING", "Net Financing Cash Flow");

  const netOperatingValues = zero();
  for (let i = 0; i < n; i++) netOperatingValues[i] = receipts.subtotal[i] + disbursements.subtotal[i];
  const netOperating: StatementRow = { key: "net_op", label: "Net Operating Cash Flow", values: netOperatingValues, total: fsum(netOperatingValues) };

  // Roll cash. Anchor beginning-of-first-forecast-period at the opening (latest
  // QB cash): roll forward for the forecast, and backward through the trailing
  // actual columns so the actual trajectory ties into today's balance.
  const opening = await effectiveOpening(config);
  const beginning = zero();
  const ending = zero();
  const netTotal = zero();
  for (let i = 0; i < n; i++) netTotal[i] = netOperating.values[i] + financing.subtotal[i];
  for (let i = firstFc; i < n; i++) {
    beginning[i] = i === firstFc ? opening.cents : ending[i - 1];
    ending[i] = beginning[i] + netTotal[i];
  }
  for (let i = firstFc - 1; i >= 0; i--) {
    ending[i] = beginning[i + 1];
    beginning[i] = ending[i] - netTotal[i];
  }

  // LOC rolls forward from its opening; draws/repayments only occur in forecast
  // columns, so the actual columns simply carry the opening LOC balance.
  const locBalance = zero();
  const locAvail = zero();
  const totalLiquidity = zero();
  const cushion = zero();
  const limit = config?.locLimitCents ?? 0;
  const minThreshold = config?.minCashCents ?? 0;
  const draws = cat.loc_draws;
  const repay = cat.loc_repayments; // negative values
  let locPrev = config?.locOpeningCents ?? 0;
  for (let i = 0; i < n; i++) {
    locPrev = locPrev + draws[i] + repay[i]; // repay negative → reduces balance
    locBalance[i] = locPrev;
    locAvail[i] = limit - locPrev;
    totalLiquidity[i] = ending[i] + locAvail[i];
    cushion[i] = totalLiquidity[i] - minThreshold;
  }

  return {
    mode,
    columns,
    firstFc,
    opening,
    beginning,
    groups: [receipts, disbursements],
    netOperating,
    financing,
    ending,
    loc: { balance: locBalance, availability: locAvail, totalLiquidity, limitCents: limit },
    minThreshold,
    cushion,
    sources,
  };
}

// ── 12-month indirect 3-statement (P&L from budgets) ─────────────────────────
export type IndirectRow = { key: string; label: string; values: number[]; strong?: boolean; sub?: boolean };
export type IndirectForecast = {
  columns: Column[];
  firstFc: number; // index of the first forecast month (columns before it are actuals)
  opening: { cents: number; auto: boolean; asOf: string | null };
  pnl: IndirectRow[];
  cash: IndirectRow[];
  ending: number[];
};

// Trailing actual months brought into the 12-month view.
const MONTHLY_BACK = 3, MONTHLY_FWD = 12;
type PnlCents = { revenue: number; cogs: number; opex: number; dna: number; interest: number; tax: number };

/** Split an Other-Expense account into the indirect model's below-the-line
 * bucket by name/subtype (no reporting codes anymore). */
function belowLineBucket(name: string, subType: string | null): "dna" | "interest" | "tax" | null {
  const s = `${name} ${subType ?? ""}`.toLowerCase();
  if (/deprec|amort|depletion/.test(s)) return "dna";
  if (/interest/.test(s)) return "interest";
  if (/income tax|\btax\b/.test(s)) return "tax";
  return null;
}

/** Monthly P&L from the winning budget per entity/fiscal-year (LOCKED else
 * latest), classified natively by QBO account type. */
async function budgetPnlMonthly(monthKeys: string[]): Promise<Record<string, { revenue: number; cogs: number; opex: number; dna: number; interest: number; tax: number }>> {
  const budgets = await prisma.budget.findMany({ select: { id: true, entityId: true, fiscalYear: true, status: true, createdAt: true } });

  // Winning budget per (entity, fiscalYear): LOCKED first, then most recent.
  const winners = new Map<string, { id: string; locked: boolean; createdAt: Date }>();
  for (const b of budgets) {
    const k = `${b.entityId}|${b.fiscalYear}`;
    const cur = winners.get(k);
    const locked = b.status === "LOCKED";
    if (!cur || (locked && !cur.locked) || (locked === cur.locked && b.createdAt > cur.createdAt)) {
      winners.set(k, { id: b.id, locked, createdAt: b.createdAt });
    }
  }
  const winnerIds = Array.from(winners.values()).map((w) => w.id);
  const lines = winnerIds.length
    ? await prisma.budgetLine.findMany({
        where: { budgetId: { in: winnerIds } },
        include: { ledgerAccount: { select: { sourceType: true, classification: true, accountSubType: true, name: true } } },
      })
    : [];

  const out: Record<string, { revenue: number; cogs: number; opex: number; dna: number; interest: number; tax: number }> = {};
  for (const mk of monthKeys) out[mk] = { revenue: 0, cogs: 0, opex: 0, dna: 0, interest: 0, tax: 0 };
  for (const l of lines) {
    const a = l.ledgerAccount;
    const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
    const monthly = (l.monthly ?? {}) as Record<string, number>;
    for (const mk of monthKeys) {
      const cents = Math.round((Number(monthly[mk]) || 0) * 100);
      if (!cents) continue;
      const b = out[mk];
      if (def.section === "Revenue" || def.section === "OtherIncome") b.revenue += cents;
      else if (def.section === "COGS") b.cogs += cents;
      else if (def.section === "OpEx") b.opex += cents;
      else if (def.section === "OtherExpense") {
        const bucket = belowLineBucket(a.name, a.accountSubType);
        if (bucket) b[bucket] += cents;
        else b.opex += cents; // uncategorized below-the-line → treat as opex
      }
    }
  }
  return out;
}

/** Actual monthly P&L (cents) from cached trial balances, classified natively —
 * the same figures the Actuals P&L shows — for the trailing actual months. */
async function actualMonthlyPnl(monthKeys: string[]): Promise<Record<string, PnlCents & { present: boolean }>> {
  const out: Record<string, PnlCents & { present: boolean }> = {};
  for (const mk of monthKeys) {
    const st = await buildStatement(null, `${mk}-01`, "IS");
    const p: PnlCents & { present: boolean } = { revenue: 0, cogs: 0, opex: 0, dna: 0, interest: 0, tax: 0, present: st.lines.length > 0 };
    const s = st.subtotals;
    p.revenue = Math.round(((s.revenue ?? 0) + (s.otherIncome ?? 0)) * 100);
    p.cogs = Math.round((s.cogs ?? 0) * 100);
    p.opex = Math.round((s.opex ?? 0) * 100);
    // Split Other Expense into below-the-line buckets; the rest folds into opex.
    const oe = st.groups.find((g) => g.section === "OtherExpense");
    for (const l of oe?.lines ?? []) {
      const cents = Math.round(l.amount * 100);
      const bucket = belowLineBucket(l.name, l.accountSubType);
      if (bucket) p[bucket] += cents;
      else p.opex += cents;
    }
    out[mk] = p;
  }
  return out;
}

/** Real month-end consolidated bank cash (cents) per month, from cached balance
 * sheets. null when that month has no balance sheet loaded. */
async function actualMonthEndCash(monthKeys: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const mk of monthKeys) {
    const bs = await buildStatement(null, `${mk}-01`, "BS");
    const bank = bs.lines.filter((l) => l.accountType === "Bank");
    out[mk] = bank.length ? Math.round(bank.reduce((s, l) => s + l.amount, 0) * 100) : null;
  }
  return out;
}

export async function buildIndirectForecast(): Promise<IndirectForecast> {
  const columns = monthlyColumns(MONTHLY_BACK, MONTHLY_FWD);
  const n = columns.length;
  const firstFc = columns.findIndex((c) => !c.actual);
  const keys = columns.map((c) => c.key);
  const actualKeys = keys.slice(0, firstFc);
  const zero = () => new Array(n).fill(0);

  const [config, budgetByMonth, actualByMonth, lines] = await Promise.all([
    getCashConfig(),
    budgetPnlMonthly(keys),
    actualMonthlyPnl(actualKeys),
    prisma.cashFlowLine.findMany({ where: { active: true, category: { in: ["loc_draws", "loc_repayments", "term_debt_service", "owner_distributions"] } } }),
  ]);
  // Actual months use real P&L; forecast months use the budget.
  const pnlByMonth: Record<string, PnlCents> = {};
  keys.forEach((mk, i) => {
    pnlByMonth[mk] = i < firstFc && actualByMonth[mk]?.present ? actualByMonth[mk] : budgetByMonth[mk];
  });

  const revenue = zero(), cogs = zero(), grossProfit = zero(), opex = zero(), ebitda = zero();
  const dna = zero(), interest = zero(), tax = zero(), netIncome = zero();
  keys.forEach((mk, i) => {
    const p = pnlByMonth[mk];
    revenue[i] = p.revenue;
    cogs[i] = p.cogs;
    grossProfit[i] = p.revenue - p.cogs;
    opex[i] = p.opex;
    ebitda[i] = grossProfit[i] - p.opex;
    dna[i] = p.dna || (config?.dnaMonthlyCents ?? 0);
    interest[i] = p.interest;
    tax[i] = p.tax;
    netIncome[i] = ebitda[i] - dna[i] - interest[i] - tax[i];
  });

  // Working-capital changes from AR/AP timing assumptions.
  const arDays = config?.arDays ?? 45;
  const apDays = config?.apDays ?? 30;
  const arBal = revenue.map((r) => Math.round((r * arDays) / 30));
  const apBal = keys.map((_, i) => Math.round(((cogs[i] + opex[i]) * apDays) / 30));
  const deltaWC = zero();
  for (let i = 0; i < n; i++) {
    const dAR = i === 0 ? 0 : arBal[i] - arBal[i - 1];
    const dAP = i === 0 ? 0 : apBal[i] - apBal[i - 1];
    deltaWC[i] = -dAR + dAP; // AR up = cash out; AP up = cash in
  }

  const capex = zero().map((_, i) => (i < firstFc ? 0 : -(config?.capexMonthlyCents ?? 0)));

  // Financing from the financing category lines, expanded over the forecast
  // months only (actual months' financing is already in their real ending cash).
  const financing = zero();
  const h0 = new Date(`${columns[firstFc].key}-01T00:00:00Z`);
  const last = columns[n - 1];
  const hN = new Date(Date.UTC(Number(last.key.slice(0, 4)), Number(last.key.slice(5, 7)), 0));
  for (const l of lines) {
    const def = CASH_CATEGORY_MAP[l.category];
    if (!def) continue;
    for (const d of occurrences({ category: l.category, amountCents: l.amountCents, cadence: l.cadence, startDate: l.startDate, endDate: l.endDate }, h0, hN)) {
      const i = columnIndexForDate(columns, "monthly", d);
      if (i >= firstFc) financing[i] += l.amountCents * def.sign;
    }
  }

  // Real month-end cash for the trailing actual months (from cached balance sheets).
  const actualEnd = await actualMonthEndCash(actualKeys);

  const cfo = zero(), netChange = zero(), ending = zero(), beginning = zero();
  const opening = await effectiveOpening(config);
  for (let i = 0; i < n; i++) {
    cfo[i] = netIncome[i] + dna[i] + deltaWC[i];
    netChange[i] = cfo[i] + capex[i] + financing[i];
  }
  // Actual months: tie ending to real bank balances where we have them, roll
  // backward/forward from there; forecast months roll off the modeled net change.
  let prevEnd: number | null = null;
  for (let i = 0; i < firstFc; i++) {
    const real = actualEnd[keys[i]];
    ending[i] = real != null ? real : (prevEnd ?? opening.cents) + netChange[i];
    beginning[i] = prevEnd ?? ending[i] - netChange[i];
    netChange[i] = ending[i] - beginning[i]; // reconcile the actual month to real cash
    prevEnd = ending[i];
  }
  for (let i = firstFc; i < n; i++) {
    beginning[i] = i === firstFc ? (prevEnd ?? opening.cents) : ending[i - 1];
    ending[i] = beginning[i] + netChange[i];
  }

  const R = (key: string, label: string, values: number[], opts: { strong?: boolean; sub?: boolean } = {}): IndirectRow => ({ key, label, values, ...opts });

  return {
    columns,
    firstFc,
    opening,
    pnl: [
      R("revenue", "Revenue", revenue),
      R("cogs", "COGS", cogs, { sub: true }),
      R("gross_profit", "Gross Profit", grossProfit, { strong: true }),
      R("opex", "Operating Expenses", opex, { sub: true }),
      R("ebitda", "EBITDA", ebitda, { strong: true }),
      R("dna", "Depreciation & Amortization", dna, { sub: true }),
      R("interest", "Interest Expense", interest, { sub: true }),
      R("tax", "Income Tax", tax, { sub: true }),
      R("net_income", "Net Income", netIncome, { strong: true }),
    ],
    cash: [
      R("ni", "Net Income", netIncome),
      R("addback_dna", "+ Depreciation & Amortization", dna, { sub: true }),
      R("wc", "± Change in Working Capital", deltaWC, { sub: true }),
      R("cfo", "Cash from Operations", cfo, { strong: true }),
      R("capex", "− Capital Expenditures", capex, { sub: true }),
      R("financing", "Financing (debt, distributions)", financing, { sub: true }),
      R("net_change", "Net Change in Cash", netChange, { strong: true }),
      R("beginning", "Beginning Cash", beginning),
      R("ending", "Ending Cash", ending, { strong: true }),
    ],
    ending,
  };
}

// ── Config + lines CRUD ──────────────────────────────────────────────────────
export async function getCashConfig() {
  return prisma.cashPosition.findUnique({ where: { scope: "firm" } });
}

export async function setCashConfig(input: {
  openingCents: number;
  openingAsOf: string;
  useQboOpening: boolean;
  minCashCents: number;
  locLimitCents: number;
  locOpeningCents: number;
  dnaMonthlyCents: number;
  capexMonthlyCents: number;
  arDays: number;
  apDays: number;
}) {
  const data = {
    openingCents: input.openingCents,
    openingAsOf: new Date(input.openingAsOf),
    useQboOpening: input.useQboOpening,
    minCashCents: input.minCashCents,
    locLimitCents: input.locLimitCents,
    locOpeningCents: input.locOpeningCents,
    dnaMonthlyCents: input.dnaMonthlyCents,
    capexMonthlyCents: input.capexMonthlyCents,
    arDays: input.arDays,
    apDays: input.apDays,
  };
  return prisma.cashPosition.upsert({ where: { scope: "firm" }, update: data, create: { scope: "firm", ...data } });
}

export async function listCashLines() {
  return prisma.cashFlowLine.findMany({ orderBy: [{ active: "desc" }, { category: "asc" }, { startDate: "asc" }] });
}

export async function addCashLine(input: {
  label: string;
  category: string;
  amountCents: number;
  cadence: "ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate?: string | null;
  netTermsDays?: number | null;
  paidWhenPaid?: boolean;
  createdBy?: string | null;
}) {
  return prisma.cashFlowLine.create({
    data: {
      label: input.label,
      category: input.category,
      amountCents: input.amountCents,
      cadence: input.cadence,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      netTermsDays: input.netTermsDays ?? null,
      paidWhenPaid: input.paidWhenPaid ?? false,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function deleteCashLine(id: string) {
  await prisma.cashFlowLine.delete({ where: { id } });
  return { ok: true as const };
}
