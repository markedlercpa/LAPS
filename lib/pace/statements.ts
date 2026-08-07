import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Build P&L / Balance Sheet from cached trial-balance lines, rolled up through
 * the firm-standard reporting COA. `entityId = null` = consolidated (sum across
 * all entities for that month).
 *
 * TB amounts are signed (debit +, credit -). For display we normalize each
 * reporting account to its natural side so normal balances read positive:
 *   magnitude = naturalSide === "CREDIT" ? -signedSum : signedSum
 */

export type StatementLine = {
  reportingAccountId: string;
  code: string | null;
  name: string;
  type: string;
  category: string | null;
  amount: number; // natural-side positive
};

export type StatementResult = {
  statement: StatementKind;
  periodMonth: string;
  lines: StatementLine[];
  subtotals: Record<string, number>;
  unmappedAmount: number; // signed sum of TB lines with no reporting mapping
};

function monthStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function buildStatement(
  entityId: string | null,
  periodMonthISO: string,
  statement: StatementKind,
): Promise<StatementResult> {
  const periodMonth = monthStart(periodMonthISO);

  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth, ...(entityId ? { entityId } : {}) },
    include: {
      lines: {
        include: {
          ledgerAccount: {
            include: { reportingAccount: true },
          },
        },
      },
    },
  });

  // Aggregate signed amounts per reporting account.
  type Agg = {
    id: string;
    code: string | null;
    name: string;
    type: string;
    category: string | null;
    naturalSide: "DEBIT" | "CREDIT";
    sortOrder: number;
    signed: number;
  };
  const byReporting = new Map<string, Agg>();
  let unmappedAmount = 0;

  for (const p of periods) {
    for (const l of p.lines) {
      const ra = l.ledgerAccount.reportingAccount;
      const amt = Number(l.amount);
      if (!ra) {
        unmappedAmount += amt;
        continue;
      }
      if (ra.statement !== statement) continue;
      const existing = byReporting.get(ra.id);
      if (existing) {
        existing.signed += amt;
      } else {
        byReporting.set(ra.id, {
          id: ra.id,
          code: ra.code,
          name: ra.name,
          type: ra.type,
          category: ra.category,
          naturalSide: ra.naturalSide,
          sortOrder: ra.sortOrder,
          signed: amt,
        });
      }
    }
  }

  const aggs = Array.from(byReporting.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: StatementLine[] = aggs.map((a) => ({
    reportingAccountId: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    category: a.category,
    amount: a.naturalSide === "CREDIT" ? -a.signed : a.signed,
  }));

  const subtotals: Record<string, number> = {};
  const sumType = (t: string) => lines.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);

  if (statement === "IS") {
    const revenue = sumType("Revenue");
    const cogs = sumType("COGS");
    const grossProfit = revenue - cogs;
    const opex = sumType("OpEx");
    const operatingIncome = grossProfit - opex;
    const otherExpense = sumType("OtherExpense");
    const netIncome = operatingIncome - otherExpense;
    Object.assign(subtotals, { revenue, cogs, grossProfit, opex, operatingIncome, otherExpense, netIncome });
  } else {
    const assets = sumType("Asset");
    const liabilities = sumType("Liability");
    const equity = sumType("Equity");
    Object.assign(subtotals, { assets, liabilities, equity, checkDiff: assets - (liabilities + equity) });
  }

  return { statement, periodMonth: periodMonth.toISOString().slice(0, 10), lines, subtotals, unmappedAmount };
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
