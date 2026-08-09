import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyAccount, sectionsFor, SECTION_LABELS, type QboSection } from "@/lib/pace/qbo-taxonomy";

/**
 * Build P&L / Balance Sheet from cached trial-balance lines, classified natively
 * by QuickBooks' own account metadata (AccountType / Classification) — no manual
 * reporting-COA mapping. `entityId = null` = consolidated (sum across entities
 * for that month); QBO AccountType is standardized, so consolidation still
 * compares like with like.
 *
 * TB amounts are signed (debit +, credit -). Each line is normalized to its
 * section's natural side so normal balances read positive:
 *   magnitude = naturalSide === "CREDIT" ? -signedSum : signedSum
 */

export type StatementLine = {
  ledgerAccountId: string;
  externalId: string | null;
  acctNum: string | null;
  name: string; // leaf name (last segment of the QBO hierarchy)
  fqName: string | null;
  depth: number; // hierarchy depth from FullyQualifiedName (0 = top level)
  accountType: string | null;
  accountSubType: string | null;
  section: QboSection;
  amount: number; // natural-side positive
};

export type StatementGroup = {
  section: QboSection;
  label: string;
  lines: StatementLine[];
  subtotal: number;
};

export type StatementResult = {
  statement: StatementKind;
  periodMonth: string;
  lines: StatementLine[]; // flat, section-ordered
  groups: StatementGroup[];
  subtotals: Record<string, number>;
  unclassifiedAmount: number; // natural-side sum of lines QBO metadata couldn't place
};

function monthStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** QBO seeds each account's opening figure with a "Beginning Balance" GL row.
 * Those belong on the balance sheet (carried by the trial balance), never in
 * P&L period activity — filter them out of any GL-sourced income statement. */
function isBeginningBalance(txnType: string | null): boolean {
  return (txnType ?? "").trim().toLowerCase() === "beginning balance";
}

type LedgerAccountRow = {
  id: string;
  externalId: string | null;
  acctNum: string | null;
  name: string;
  fqName: string | null;
  sourceType: string | null;
  classification: string | null;
  accountSubType: string | null;
};
type RawLine = { account: LedgerAccountRow; amount: number };

/** Income statement is period *activity* → built from the general ledger
 * (beginning balances excluded). Balance sheet is a point-in-time *balance* →
 * built from the trial balance (beginning balances included). */
async function rawLinesForMonth(entityId: string | null, periodMonth: Date, statement: StatementKind): Promise<RawLine[]> {
  if (statement === "IS") {
    const gl = await prisma.generalLedgerLine.findMany({
      where: { periodMonth, ...(entityId ? { entityId } : {}) },
      include: { ledgerAccount: true },
    });
    const out: RawLine[] = [];
    for (const l of gl) {
      if (!l.ledgerAccount || isBeginningBalance(l.txnType)) continue;
      out.push({ account: l.ledgerAccount, amount: Number(l.amount) });
    }
    return out;
  }
  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth, ...(entityId ? { entityId } : {}) },
    include: { lines: { include: { ledgerAccount: true } } },
  });
  return periods.flatMap((p) => p.lines.map((l) => ({ account: l.ledgerAccount, amount: Number(l.amount) })));
}

/** Same source split as `rawLinesForMonth`, over a month window, each line tagged
 * with its month key. IS → general ledger (no beginning balances); BS → trial
 * balance (balances, including beginning balances). */
async function rawLinesForWindow(
  entityId: string | null,
  windowStart: Date,
  windowEnd: Date,
  statement: StatementKind,
): Promise<(RawLine & { mk: string })[]> {
  if (statement === "IS") {
    const gl = await prisma.generalLedgerLine.findMany({
      where: { periodMonth: { gte: windowStart, lte: windowEnd }, ...(entityId ? { entityId } : {}) },
      include: { ledgerAccount: true },
    });
    const out: (RawLine & { mk: string })[] = [];
    for (const l of gl) {
      if (!l.ledgerAccount || isBeginningBalance(l.txnType)) continue;
      out.push({ account: l.ledgerAccount, amount: Number(l.amount), mk: monthKey(l.periodMonth) });
    }
    return out;
  }
  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth: { gte: windowStart, lte: windowEnd }, ...(entityId ? { entityId } : {}) },
    include: { lines: { include: { ledgerAccount: true } } },
  });
  return periods.flatMap((p) => p.lines.map((l) => ({ account: l.ledgerAccount, amount: Number(l.amount), mk: monthKey(p.periodMonth) })));
}

function leafName(fqName: string | null, name: string): string {
  if (!fqName) return name;
  const parts = fqName.split(":");
  return parts[parts.length - 1]?.trim() || name;
}

export async function buildStatement(
  entityId: string | null,
  periodMonthISO: string,
  statement: StatementKind,
): Promise<StatementResult> {
  const periodMonth = monthStart(periodMonthISO);

  const rawLines = await rawLinesForMonth(entityId, periodMonth, statement);

  // Aggregate signed amounts per source ledger account, classified natively.
  type Agg = {
    line: StatementLine;
    naturalSide: "DEBIT" | "CREDIT";
    sortOrder: number;
    signed: number;
  };
  const byAccount = new Map<string, Agg>();

  for (const { account: a, amount: amt } of rawLines) {
    const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
    if (def.statement !== statement) continue;
    const existing = byAccount.get(a.id);
    if (existing) {
      existing.signed += amt;
    } else {
      byAccount.set(a.id, {
        naturalSide: def.naturalSide,
        sortOrder: def.sortOrder,
        signed: amt,
        line: {
          ledgerAccountId: a.id,
          externalId: a.externalId,
          acctNum: a.acctNum,
          name: leafName(a.fqName, a.name),
          fqName: a.fqName,
          depth: a.fqName ? a.fqName.split(":").length - 1 : 0,
          accountType: a.sourceType,
          accountSubType: a.accountSubType,
          section: def.section,
          amount: 0,
        },
      });
    }
  }

  // Natural-side normalize + drop zero-balance lines (QBO hides them).
  const aggs = Array.from(byAccount.values())
    .map((a) => {
      a.line.amount = a.naturalSide === "CREDIT" ? -a.signed : a.signed;
      return a;
    })
    .filter((a) => Math.abs(a.line.amount) >= 0.005)
    .sort((a, b) => a.sortOrder - b.sortOrder || byAcctNum(a.line, b.line));

  const lines = aggs.map((a) => a.line);

  // Group into sections in statement display order.
  const groups: StatementGroup[] = [];
  for (const section of sectionsFor(statement)) {
    const secLines = lines.filter((l) => l.section === section);
    if (secLines.length === 0) continue;
    groups.push({
      section,
      label: SECTION_LABELS[section],
      lines: secLines,
      subtotal: secLines.reduce((s, l) => s + l.amount, 0),
    });
  }

  const sumSection = (s: QboSection) => lines.filter((l) => l.section === s).reduce((a, l) => a + l.amount, 0);
  const unclassifiedAmount = sumSection("Unclassified");

  const subtotals: Record<string, number> = {};
  if (statement === "IS") {
    const revenue = sumSection("Revenue");
    const cogs = sumSection("COGS");
    const grossProfit = revenue - cogs;
    const opex = sumSection("OpEx");
    const operatingIncome = grossProfit - opex;
    const otherIncome = sumSection("OtherIncome");
    const otherExpense = sumSection("OtherExpense");
    const netIncome = operatingIncome + otherIncome - otherExpense - unclassifiedAmount;
    Object.assign(subtotals, { revenue, cogs, grossProfit, opex, operatingIncome, otherIncome, otherExpense, netIncome });
  } else {
    const assets = sumSection("Asset");
    const liabilities = sumSection("Liability");
    const equity = sumSection("Equity");
    Object.assign(subtotals, { assets, liabilities, equity, checkDiff: assets - (liabilities + equity) });
  }

  return {
    statement,
    periodMonth: periodMonth.toISOString().slice(0, 10),
    lines,
    groups,
    subtotals,
    unclassifiedAmount,
  };
}

/** Numeric-aware account-number sort (blanks last), then by name. */
function byAcctNum(a: { acctNum: string | null; name: string }, b: { acctNum: string | null; name: string }): number {
  const an = a.acctNum ?? "";
  const bn = b.acctNum ?? "";
  if (an && bn) {
    const na = Number(an);
    const nb = Number(bn);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (an !== bn) return an.localeCompare(bn);
  } else if (an !== bn) {
    return an ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** Latest month's cash: natural-side sum of QBO Bank-type accounts (the cash
 * position QBO shows), in cents. Used to auto-seed the cash forecast opening. */
export async function latestBankCashCents(entityId?: string): Promise<{ cents: number; asOf: string } | null> {
  const months = await availableMonths(entityId);
  if (months.length === 0) return null;
  const bs = await buildStatement(entityId ?? null, months[0], "BS");
  const bank = bs.lines.filter((l) => l.accountType === "Bank");
  if (bank.length === 0) return null;
  const total = bank.reduce((s, l) => s + l.amount, 0);
  return { cents: Math.round(total * 100), asOf: months[0].slice(0, 10) };
}

// ── Multi-column statements (Month / YTD / TTM / prior-year / deltas) ─────────

export type ColumnKey = "month" | "ytd" | "ttm" | "priorMonth" | "priorYear" | "deltaYoY" | "deltaYoYPct";

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  month: "Month",
  ytd: "YTD",
  ttm: "TTM",
  priorMonth: "Prior month",
  priorYear: "Prior year",
  deltaYoY: "Δ YoY",
  deltaYoYPct: "Δ % YoY",
};

export type MultiLine = {
  ledgerAccountId: string;
  acctNum: string | null;
  name: string;
  depth: number;
  accountType: string | null;
  amounts: number[]; // one per requested column
};
export type MultiGroup = { section: QboSection; label: string; lines: MultiLine[]; subtotals: number[] };
export type MultiStatement = {
  statement: StatementKind;
  asOf: string; // "YYYY-MM"
  columns: { key: ColumnKey; label: string }[];
  groups: MultiGroup[];
  subtotals: Record<string, number[]>; // e.g. revenue/grossProfit/netIncome per column
  unclassifiedAmount: number[];
};

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftMonthKey(asOf: string, deltaMonths: number): string {
  const [y, m] = asOf.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + deltaMonths, 1)));
}
/** The set of month keys an IS column sums; BS uses only the last (as-of) month. */
function monthsForColumn(key: ColumnKey, asOf: string): string[] {
  const [y, m] = asOf.split("-").map(Number);
  switch (key) {
    case "month":
    case "deltaYoY":
    case "deltaYoYPct":
      return [asOf];
    case "ytd":
      return Array.from({ length: m }, (_, i) => monthKey(new Date(Date.UTC(y, i, 1))));
    case "ttm":
      return Array.from({ length: 12 }, (_, i) => shiftMonthKey(asOf, -(11 - i)));
    case "priorMonth":
      return [shiftMonthKey(asOf, -1)];
    case "priorYear":
      return [shiftMonthKey(asOf, -12)];
  }
}

/**
 * Build a statement with several period columns at once (Month, YTD, TTM,
 * prior-period, and YoY deltas), classified natively by QBO metadata. For IS a
 * column is the sum of its months' activity; for BS it's the balance at the
 * column's as-of month. `deltaYoY`/`deltaYoYPct` are derived from month vs.
 * prior-year and don't sum into section subtotals as dollars twice.
 */
export async function buildStatementColumns(
  entityId: string | null,
  asOf: string, // "YYYY-MM"
  statement: StatementKind,
  columns: ColumnKey[],
): Promise<MultiStatement> {
  const isIS = statement === "IS";
  // Load a trailing 24-month window (covers TTM + prior year) up to asOf.
  const windowStart = new Date(`${shiftMonthKey(asOf, -23)}-01T00:00:00Z`);
  const asOfEnd = new Date(Date.UTC(Number(asOf.split("-")[0]), Number(asOf.split("-")[1]), 0));

  const rawLines = await rawLinesForWindow(entityId, windowStart, asOfEnd, statement);

  // account id → { meta, natural amount per month key }
  type Acc = { line: Omit<MultiLine, "amounts">; section: QboSection; sortOrder: number; byMonth: Map<string, number> };
  const accounts = new Map<string, Acc>();
  for (const { account: a, amount: signed, mk } of rawLines) {
    const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
    if (def.statement !== statement) continue;
    const nat = def.naturalSide === "CREDIT" ? -signed : signed;
    let acc = accounts.get(a.id);
    if (!acc) {
      acc = {
        line: {
          ledgerAccountId: a.id,
          acctNum: a.acctNum,
          name: leafName(a.fqName, a.name),
          depth: a.fqName ? a.fqName.split(":").length - 1 : 0,
          accountType: a.sourceType,
        },
        section: def.section,
        sortOrder: def.sortOrder,
        byMonth: new Map(),
      };
      accounts.set(a.id, acc);
    }
    acc.byMonth.set(mk, (acc.byMonth.get(mk) ?? 0) + nat);
  }

  const amountFor = (acc: Acc, col: ColumnKey): number => {
    if (col === "deltaYoY" || col === "deltaYoYPct") {
      const cur = acc.byMonth.get(asOf) ?? 0;
      const py = acc.byMonth.get(shiftMonthKey(asOf, -12)) ?? 0;
      if (col === "deltaYoY") return cur - py;
      return py !== 0 ? ((cur - py) / Math.abs(py)) * 100 : 0;
    }
    const months = monthsForColumn(col, asOf);
    if (isIS) return months.reduce((s, mk) => s + (acc.byMonth.get(mk) ?? 0), 0);
    // BS: balance at the column's as-of (last) month.
    return acc.byMonth.get(months[months.length - 1]) ?? 0;
  };

  const rows = Array.from(accounts.values())
    .map((acc) => ({ acc, amounts: columns.map((c) => amountFor(acc, c)) }))
    .filter((r) => r.amounts.some((v) => Math.abs(v) >= 0.005))
    .sort((a, b) => a.acc.sortOrder - b.acc.sortOrder || byAcctNum(a.acc.line, b.acc.line));

  const groups: MultiGroup[] = [];
  for (const section of sectionsFor(statement)) {
    const secRows = rows.filter((r) => r.acc.section === section);
    if (secRows.length === 0) continue;
    const subtotals = columns.map((_, ci) => secRows.reduce((s, r) => s + r.amounts[ci], 0));
    groups.push({
      section,
      label: SECTION_LABELS[section],
      lines: secRows.map((r) => ({ ...r.acc.line, amounts: r.amounts })),
      subtotals,
    });
  }

  const sectionCol = (section: QboSection, ci: number) =>
    rows.filter((r) => r.acc.section === section).reduce((s, r) => s + r.amounts[ci], 0);
  const perCol = <T,>(fn: (ci: number) => T) => columns.map((_, ci) => fn(ci));

  const subtotals: Record<string, number[]> = {};
  if (isIS) {
    subtotals.revenue = perCol((ci) => sectionCol("Revenue", ci));
    subtotals.cogs = perCol((ci) => sectionCol("COGS", ci));
    subtotals.grossProfit = perCol((ci) => sectionCol("Revenue", ci) - sectionCol("COGS", ci));
    subtotals.opex = perCol((ci) => sectionCol("OpEx", ci));
    subtotals.operatingIncome = perCol((ci) => subtotals.grossProfit[ci] - sectionCol("OpEx", ci));
    subtotals.otherIncome = perCol((ci) => sectionCol("OtherIncome", ci));
    subtotals.otherExpense = perCol((ci) => sectionCol("OtherExpense", ci));
    subtotals.netIncome = perCol(
      (ci) => subtotals.operatingIncome[ci] + sectionCol("OtherIncome", ci) - sectionCol("OtherExpense", ci) - sectionCol("Unclassified", ci),
    );
  } else {
    subtotals.assets = perCol((ci) => sectionCol("Asset", ci));
    subtotals.liabilities = perCol((ci) => sectionCol("Liability", ci));
    subtotals.equity = perCol((ci) => sectionCol("Equity", ci));
    subtotals.checkDiff = perCol((ci) => sectionCol("Asset", ci) - (sectionCol("Liability", ci) + sectionCol("Equity", ci)));
  }

  return {
    statement,
    asOf,
    columns: columns.map((k) => ({ key: k, label: COLUMN_LABELS[k] })),
    groups,
    subtotals,
    unclassifiedAmount: perCol((ci) => sectionCol("Unclassified", ci)),
  };
}

/** Distinct months that have any trial balance loaded (newest first). */
export async function availableMonths(entityId?: string): Promise<string[]> {
  const periods = await prisma.trialBalancePeriod.findMany({
    where: entityId ? { entityId } : {},
    select: { periodMonth: true },
    orderBy: { periodMonth: "desc" },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of periods) {
    const k = p.periodMonth.toISOString().slice(0, 10);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
