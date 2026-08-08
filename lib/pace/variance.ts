import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumMonths } from "@/lib/pace/budgets";
import { classifyAccount, SECTION_LABELS, type QboSection } from "@/lib/pace/qbo-taxonomy";

/**
 * Budget-vs-actual variance engine. Budgets and actuals are both native at the
 * QuickBooks account level, so BvA compares account-to-account — no translation.
 * Actuals come from the cached trial balances (natural-side positive, like the
 * statements); budget comes from the selected Budget version. Favorable/
 * unfavorable follows the account's section economics; a materiality threshold
 * drives the exception-first view.
 */

export type Basis = "month" | "qtd" | "ytd";

// Materiality: flag a variance that is large in dollars OR in percent.
export const MATERIAL_DOLLARS = 5000;
export const MATERIAL_PCT = 0.1;

// QBO P&L order: Income → COGS → Expenses → Other Income → Other Expense.
const IS_SECTIONS: QboSection[] = ["Revenue", "COGS", "OpEx", "OtherIncome", "OtherExpense"];
const BS_SECTIONS: QboSection[] = ["Asset", "Liability", "Equity"];
const REVENUE_SECTIONS = new Set<QboSection>(["Revenue", "OtherIncome"]);

export type VarianceRow = {
  accountKey: string; // ledgerAccountId
  name: string;
  statement: StatementKind;
  type: string; // section (e.g. "Revenue", "OpEx") — used for grouping + subtotals
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
  const m = d.getUTCMonth();
  const key = (mi: number) => `${y}-${String(mi + 1).padStart(2, "0")}`;
  if (basis === "month") return [key(m)];
  if (basis === "ytd") return Array.from({ length: m + 1 }, (_, i) => key(i));
  const qStart = Math.floor(m / 3) * 3;
  return Array.from({ length: m - qStart + 1 }, (_, i) => key(qStart + i));
}

/** Actual natural-side amount per ledger account across the given months. */
async function actualsByAccount(entityId: string | null, months: string[]) {
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
      const signed = Number(l.amount);
      const mag = def.naturalSide === "CREDIT" ? -signed : signed;
      out.set(a.id, (out.get(a.id) ?? 0) + mag);
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
  const wantSections = statement === "IS" ? IS_SECTIONS : BS_SECTIONS;

  const [budgetLines, actuals] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { budgetId: input.budgetId },
      include: { ledgerAccount: { select: { id: true, name: true, acctNum: true, sourceType: true, classification: true } } },
    }),
    actualsByAccount(input.entityId, months),
  ]);

  // Union of accounts appearing in the budget or the actuals, on this statement.
  type Meta = { name: string; acctNum: string | null; section: QboSection };
  const meta = new Map<string, Meta>();
  const budgetByAccount = new Map<string, number>();
  for (const l of budgetLines) {
    const a = l.ledgerAccount;
    const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
    if (def.statement !== statement) continue;
    budgetByAccount.set(a.id, sumMonths((l.monthly ?? {}) as Record<string, number>, months));
    meta.set(a.id, { name: a.name, acctNum: a.acctNum, section: def.section });
  }
  // Actual-only accounts need their meta too.
  const actualAccts = await prisma.ledgerAccount.findMany({
    where: { id: { in: Array.from(actuals.keys()).filter((id) => !meta.has(id)) } },
    select: { id: true, name: true, acctNum: true, sourceType: true, classification: true },
  });
  for (const a of actualAccts) {
    const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
    if (def.statement !== statement) continue;
    meta.set(a.id, { name: a.name, acctNum: a.acctNum, section: def.section });
  }

  const rows: VarianceRow[] = Array.from(meta.entries()).map(([id, m]) => {
    const actual = actuals.get(id) ?? 0;
    const budget = budgetByAccount.get(id) ?? 0;
    const varianceAmt = actual - budget;
    const variancePct = budget !== 0 ? varianceAmt / Math.abs(budget) : null;
    const isRevenue = REVENUE_SECTIONS.has(m.section);
    const favorable = statement !== "IS" ? null : isRevenue ? varianceAmt >= 0 : varianceAmt <= 0;
    const material =
      (Math.abs(varianceAmt) >= MATERIAL_DOLLARS || (variancePct !== null && Math.abs(variancePct) >= MATERIAL_PCT)) &&
      (actual !== 0 || budget !== 0);
    return {
      accountKey: id,
      name: m.acctNum ? `${m.acctNum} · ${m.name}` : m.name,
      statement,
      type: m.section,
      actual,
      budget,
      varianceAmt,
      variancePct,
      favorable,
      material,
    };
  });

  // Order by section, then by absolute variance (biggest movers first).
  const order = new Map(wantSections.map((s, i) => [s as string, i]));
  rows.sort(
    (a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99) || Math.abs(b.varianceAmt) - Math.abs(a.varianceAmt),
  );

  const subtotals: VarianceResult["subtotals"] = {};
  const add = (k: string, r: VarianceRow) => {
    subtotals[k] ??= { actual: 0, budget: 0, varianceAmt: 0 };
    subtotals[k].actual += r.actual;
    subtotals[k].budget += r.budget;
    subtotals[k].varianceAmt += r.varianceAmt;
  };
  for (const r of rows) {
    add(r.type, r);
    // Also key by the section label so the review/variance chips resolve by
    // label too — but only when the label differs from the enum key, or we'd
    // double-count (SECTION_LABELS.Revenue === "Revenue").
    const label = SECTION_LABELS[r.type as QboSection];
    if (label && label !== r.type) add(label, r);
  }

  return { rows, materialRows: rows.filter((r) => r.material), subtotals };
}
