import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumMonths } from "@/lib/pace/budgets";

/**
 * Budget-vs-actual variance engine. Actuals come from the cached trial balances
 * (rolled up through the reporting COA, natural-side positive, like the
 * statements); budget comes from the selected Budget version. Favorable/
 * unfavorable follows each account's economics; a materiality threshold drives
 * the exception-first view.
 */

export type Basis = "month" | "qtd" | "ytd";

// Materiality: flag a variance that is large in dollars OR in percent.
export const MATERIAL_DOLLARS = 5000;
export const MATERIAL_PCT = 0.1;

export type VarianceRow = {
  reportingAccountId: string;
  code: string | null;
  name: string;
  statement: StatementKind;
  type: string;
  actual: number;
  budget: number;
  varianceAmt: number; // actual - budget
  variancePct: number | null; // null when budget is 0
  favorable: boolean | null; // null for balance-sheet accounts
  material: boolean;
};

function monthStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** The month keys ("YYYY-MM") covered by a basis ending at periodMonth. */
export function basisMonths(periodMonthISO: string, basis: Basis): string[] {
  const d = monthStart(periodMonthISO);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const key = (mi: number) => `${y}-${String(mi + 1).padStart(2, "0")}`;
  if (basis === "month") return [key(m)];
  if (basis === "ytd") return Array.from({ length: m + 1 }, (_, i) => key(i));
  // qtd
  const qStart = Math.floor(m / 3) * 3;
  return Array.from({ length: m - qStart + 1 }, (_, i) => key(qStart + i));
}

/** Actual amount per reporting account across the given months (natural-side +). */
async function actualsByAccount(entityId: string | null, months: string[]): Promise<Map<string, number>> {
  const monthDates = months.map((m) => new Date(`${m}-01`));
  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth: { in: monthDates }, ...(entityId ? { entityId } : {}) },
    include: { lines: { include: { ledgerAccount: { include: { reportingAccount: true } } } } },
  });
  const out = new Map<string, number>();
  for (const p of periods) {
    for (const l of p.lines) {
      const ra = l.ledgerAccount.reportingAccount;
      if (!ra) continue;
      const signed = Number(l.amount);
      const mag = ra.naturalSide === "CREDIT" ? -signed : signed;
      out.set(ra.id, (out.get(ra.id) ?? 0) + mag);
    }
  }
  return out;
}

export type VarianceResult = {
  rows: VarianceRow[];
  materialRows: VarianceRow[];
  subtotals: Record<string, { actual: number; budget: number; varianceAmt: number }>;
};

export async function computeVariance(input: {
  entityId: string | null;
  budgetId: string;
  periodMonthISO: string;
  basis: Basis;
  statement?: StatementKind; // default IS (the P&L is where BvA lives)
}): Promise<VarianceResult> {
  const statement = input.statement ?? "IS";
  const months = basisMonths(input.periodMonthISO, input.basis);

  const [accounts, budgetLines, actuals] = await Promise.all([
    prisma.reportingAccount.findMany({ where: { statement }, orderBy: { sortOrder: "asc" } }),
    prisma.budgetLine.findMany({ where: { budgetId: input.budgetId } }),
    actualsByAccount(input.entityId, months),
  ]);

  const budgetByAccount = new Map(
    budgetLines.map((l) => [l.reportingAccountId, sumMonths((l.monthly ?? {}) as Record<string, number>, months)]),
  );

  const rows: VarianceRow[] = accounts.map((a) => {
    const actual = actuals.get(a.id) ?? 0;
    const budget = budgetByAccount.get(a.id) ?? 0;
    const varianceAmt = actual - budget;
    const variancePct = budget !== 0 ? varianceAmt / Math.abs(budget) : null;
    const isRevenue = a.type === "Revenue";
    const favorable =
      statement !== "IS" ? null : isRevenue ? varianceAmt >= 0 : varianceAmt <= 0;
    const material =
      Math.abs(varianceAmt) >= MATERIAL_DOLLARS || (variancePct !== null && Math.abs(variancePct) >= MATERIAL_PCT);
    return {
      reportingAccountId: a.id,
      code: a.code,
      name: a.name,
      statement: a.statement,
      type: a.type,
      actual,
      budget,
      varianceAmt,
      variancePct,
      favorable,
      material: material && (actual !== 0 || budget !== 0),
    };
  });

  const subtotals: VarianceResult["subtotals"] = {};
  const add = (k: string, r: VarianceRow) => {
    subtotals[k] ??= { actual: 0, budget: 0, varianceAmt: 0 };
    subtotals[k].actual += r.actual;
    subtotals[k].budget += r.budget;
    subtotals[k].varianceAmt += r.varianceAmt;
  };
  for (const r of rows) add(r.type, r);

  return { rows, materialRows: rows.filter((r) => r.material), subtotals };
}
