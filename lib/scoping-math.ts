import type { StaffLevel } from "@prisma/client";

/** Pure scoping math — safe to import in client components (no prisma). */

export type ScopeLine = { level: StaffLevel; hours: number; costRate: number; billRate: number };

export type ScopeComputed = {
  budgetCost: number;
  budgetRevenue: number;
  quotedRevenue: number;
  realization: number; // quoted / budget revenue (1 = 100%)
  marginAmount: number;
  marginPct: number;
  totalHours: number;
};

export function computeScope(
  lines: ScopeLine[],
  markupEnabled: boolean,
  markupPct: number,
): ScopeComputed {
  const budgetCost = lines.reduce((s, l) => s + l.hours * l.costRate, 0);
  const budgetRevenue = lines.reduce((s, l) => s + l.hours * l.billRate, 0);
  const quotedRevenue = markupEnabled ? budgetRevenue * (1 + markupPct / 100) : budgetRevenue;
  const realization = budgetRevenue > 0 ? quotedRevenue / budgetRevenue : 0;
  const marginAmount = quotedRevenue - budgetCost;
  const marginPct = quotedRevenue > 0 ? (marginAmount / quotedRevenue) * 100 : 0;
  const totalHours = lines.reduce((s, l) => s + l.hours, 0);
  return { budgetCost, budgetRevenue, quotedRevenue, realization, marginAmount, marginPct, totalHours };
}
