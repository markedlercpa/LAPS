import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumMonths } from "@/lib/pace/budgets";
import { classifyAccount } from "@/lib/pace/qbo-taxonomy";

/**
 * Budget-vs-actual variance engine. Budgets are entered per reporting-COA line;
 * actuals come from the cached trial balances, classified natively by QBO
 * AccountType (no manual mapping). Because a QBO account only tells us its
 * section — not which specific reporting line it belongs to — BvA is computed at
 * the statement-section level (Revenue, COGS, OpEx, Other Expense): each side
 * rolls up to its `type`, and we compare like with like. Favorable/unfavorable
 * follows the section's economics; a materiality threshold drives the
 * exception-first view.
 */

export type Basis = "month" | "qtd" | "ytd";

// Materiality: flag a variance that is large in dollars OR in percent.
export const MATERIAL_DOLLARS = 5000;
export const MATERIAL_PCT = 0.1;

/** IS section keys we report BvA on, in display order, with labels. */
const IS_TYPES: { key: string; label: string }[] = [
  { key: "Revenue", label: "Revenue" },
  { key: "COGS", label: "Cost of Goods Sold" },
  { key: "OpEx", label: "Operating Expenses" },
  { key: "OtherExpense", label: "Other Expense" },
];
const BS_TYPES: { key: string; label: string }[] = [
  { key: "Asset", label: "Assets" },
  { key: "Liability", label: "Liabilities" },
  { key: "Equity", label: "Equity" },
];

export type VarianceRow = {
  accountKey: string; // statement section / reporting `type` (e.g. "Revenue")
  name: string;
  statement: StatementKind;
  type: string;
  actual: number;
  budget: number;
  varianceAmt: number; // actual - budget
  variancePct: number | null; // null when budget is 0
  favorable: boolean | null; // null for balance-sheet sections
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

/** Actual amount per section (QBO varianceType) across the given months
 * (natural-side positive). Unclassified accounts fold into "Unclassified". */
async function actualsByType(entityId: string | null, months: string[]): Promise<Map<string, number>> {
  const monthDates = months.map((m) => new Date(`${m}-01`));
  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth: { in: monthDates }, ...(entityId ? { entityId } : {}) },
    include: { lines: { include: { ledgerAccount: true } } },
  });
  const out = new Map<string, number>();
  for (const p of periods) {
    for (const l of p.lines) {
      const a = l.ledgerAccount;
      const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
      const key = def.varianceType ?? "Unclassified";
      const signed = Number(l.amount);
      const mag = def.naturalSide === "CREDIT" ? -signed : signed;
      out.set(key, (out.get(key) ?? 0) + mag);
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

  const [budgetLines, actuals] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { budgetId: input.budgetId, reportingAccount: { statement } },
      include: { reportingAccount: { select: { type: true } } },
    }),
    actualsByType(input.entityId, months),
  ]);

  // Budget rolled up to reporting `type` (matches the actuals' section keys).
  const budgetByType = new Map<string, number>();
  for (const l of budgetLines) {
    const type = l.reportingAccount.type;
    const amt = sumMonths((l.monthly ?? {}) as Record<string, number>, months);
    budgetByType.set(type, (budgetByType.get(type) ?? 0) + amt);
  }

  const wanted = statement === "IS" ? IS_TYPES : BS_TYPES;
  // Include an Unclassified row only when actuals landed there.
  const keys = [...wanted];
  if ((actuals.get("Unclassified") ?? 0) !== 0) keys.push({ key: "Unclassified", label: "Unclassified" });

  const rows: VarianceRow[] = keys.map(({ key, label }) => {
    const actual = actuals.get(key) ?? 0;
    const budget = budgetByType.get(key) ?? 0;
    const varianceAmt = actual - budget;
    const variancePct = budget !== 0 ? varianceAmt / Math.abs(budget) : null;
    const isRevenue = key === "Revenue";
    const favorable = statement !== "IS" ? null : isRevenue ? varianceAmt >= 0 : varianceAmt <= 0;
    const material =
      Math.abs(varianceAmt) >= MATERIAL_DOLLARS || (variancePct !== null && Math.abs(variancePct) >= MATERIAL_PCT);
    return {
      accountKey: key,
      name: label,
      statement,
      type: key,
      actual,
      budget,
      varianceAmt,
      variancePct,
      favorable,
      material: material && (actual !== 0 || budget !== 0),
    };
  });

  const subtotals: VarianceResult["subtotals"] = {};
  for (const r of rows) subtotals[r.type] = { actual: r.actual, budget: r.budget, varianceAmt: r.varianceAmt };

  return { rows, materialRows: rows.filter((r) => r.material), subtotals };
}
