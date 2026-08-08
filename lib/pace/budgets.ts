import type { BudgetKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureReportingCoaSeeded } from "@/lib/pace/coa";

/**
 * Budgets — entered at the firm-standard reporting-COA line so they tie to the
 * statements with zero mapping. Twelve monthly amounts per account (calendar
 * fiscal year), versioned and lockable. Reforecasts/scenarios are new versions;
 * nothing is overwritten.
 */

/** Month keys "YYYY-MM" for a calendar fiscal year. */
export function fiscalMonths(fiscalYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${fiscalYear}-${String(i + 1).padStart(2, "0")}`);
}

export async function createBudget(input: {
  entityId: string;
  fiscalYear: number;
  label: string;
  kind?: BudgetKind;
  copyFromId?: string; // seed lines from an existing version (reforecast)
}) {
  const budget = await prisma.budget.create({
    data: {
      entityId: input.entityId,
      fiscalYear: input.fiscalYear,
      label: input.label,
      kind: input.kind ?? "ORIGINAL",
    },
  });
  if (input.copyFromId) {
    const src = await prisma.budgetLine.findMany({ where: { budgetId: input.copyFromId } });
    if (src.length) {
      await prisma.budgetLine.createMany({
        data: src.map((l) => ({ budgetId: budget.id, reportingAccountId: l.reportingAccountId, monthly: l.monthly ?? {} })),
      });
    }
  }
  return budget;
}

/** The editable grid: every reporting account (IS + BS) with its monthly row. */
export async function getBudgetGrid(budgetId: string) {
  await ensureReportingCoaSeeded();
  const [budget, accounts, lines] = await Promise.all([
    prisma.budget.findUnique({ where: { id: budgetId }, include: { entity: { select: { name: true } } } }),
    prisma.reportingAccount.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.budgetLine.findMany({ where: { budgetId } }),
  ]);
  if (!budget) return null;
  const byAccount = new Map(lines.map((l) => [l.reportingAccountId, (l.monthly ?? {}) as Record<string, number>]));
  const months = fiscalMonths(budget.fiscalYear);
  return {
    budget,
    months,
    rows: accounts.map((a) => ({
      reportingAccountId: a.id,
      code: a.code,
      name: a.name,
      statement: a.statement,
      type: a.type,
      monthly: byAccount.get(a.id) ?? {},
    })),
  };
}

/** Upsert one account's twelve monthly amounts. Blocked when the budget is locked. */
export async function saveBudgetLine(budgetId: string, reportingAccountId: string, monthly: Record<string, number>) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { status: true } });
  if (!budget) return { ok: false as const, error: "Budget not found" };
  if (budget.status === "LOCKED") return { ok: false as const, error: "Budget is locked — unlock to edit." };
  await prisma.budgetLine.upsert({
    where: { budgetId_reportingAccountId: { budgetId, reportingAccountId } },
    update: { monthly },
    create: { budgetId, reportingAccountId, monthly },
  });
  return { ok: true as const };
}

/** Save the whole grid at once (one transaction). Blocked when locked. */
export async function saveBudgetLinesBulk(
  budgetId: string,
  lines: { reportingAccountId: string; monthly: Record<string, number> }[],
) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { status: true } });
  if (!budget) return { ok: false as const, error: "Budget not found" };
  if (budget.status === "LOCKED") return { ok: false as const, error: "Budget is locked — unlock to edit." };
  await prisma.$transaction(
    lines.map((l) =>
      prisma.budgetLine.upsert({
        where: { budgetId_reportingAccountId: { budgetId, reportingAccountId: l.reportingAccountId } },
        update: { monthly: l.monthly },
        create: { budgetId, reportingAccountId: l.reportingAccountId, monthly: l.monthly },
      }),
    ),
  );
  return { ok: true as const, saved: lines.length };
}

export async function setBudgetStatus(budgetId: string, locked: boolean) {
  await prisma.budget.update({ where: { id: budgetId }, data: { status: locked ? "LOCKED" : "DRAFT" } });
  return { ok: true as const };
}

/** Delete a budget version (its lines cascade). Locked budgets must be unlocked first. */
export async function deleteBudget(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { status: true } });
  if (!budget) return { ok: false as const, error: "Budget not found." };
  if (budget.status === "LOCKED") return { ok: false as const, error: "Budget is locked — unlock it before deleting." };
  await prisma.budget.delete({ where: { id: budgetId } });
  return { ok: true as const };
}

/** Sum a budget line's amounts over a set of month keys. */
export function sumMonths(monthly: Record<string, number>, months: string[]): number {
  return months.reduce((s, m) => s + (Number(monthly[m]) || 0), 0);
}
