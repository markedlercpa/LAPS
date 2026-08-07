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

/** Sum a budget line's amounts over a set of month keys. */
export function sumMonths(monthly: Record<string, number>, months: string[]): number {
  return months.reduce((s, m) => s + (Number(monthly[m]) || 0), 0);
}

/**
 * Import a QBO budget into a new PACE budget version. QBO budget accounts are
 * mapped to the reporting COA via the existing LedgerAccount mapping (the same
 * one Actuals uses). Unmapped accounts are skipped and ensured present in the
 * exception queue — never silently dropped, and never block the import.
 */
export async function importQboBudget(input: { entityId: string; fiscalYear: number; budgetName?: string }) {
  const { pullBudget } = await import("@/lib/pace/qbo");
  const budgets = await pullBudget(input.entityId);
  if (!budgets) return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
  if (budgets.length === 0) return { ok: false as const, error: "No budgets found in QuickBooks for this company." };

  const chosen = input.budgetName ? budgets.find((b) => b.name === input.budgetName) ?? budgets[0] : budgets[0];
  const yearLines = chosen.lines.filter((l) => l.month.startsWith(String(input.fiscalYear)));
  if (yearLines.length === 0) {
    return { ok: false as const, error: `QBO budget "${chosen.name}" has no lines for FY${input.fiscalYear}.` };
  }

  // Resolve each QBO account → reporting account via the entity's ledger map,
  // ensuring an (unmapped) LedgerAccount exists for anything new.
  const existing = await prisma.ledgerAccount.findMany({ where: { entityId: input.entityId } });
  const byExternal = new Map(existing.map((a) => [a.externalId, a]));

  const monthlyByReporting = new Map<string, Record<string, number>>();
  let imported = 0;
  let skipped = 0;
  const skippedAccounts = new Set<string>();

  // Diagnostics: how many detail lines came back for this FY and the gross
  // dollars they carry. This lets the UI tell a parse/pull miss (totalPulled=0)
  // apart from an all-unmapped miss (totalPulled>0 but imported=0).
  const rawLineCount = yearLines.length;
  const totalPulled = yearLines.reduce((s, l) => s + Math.abs(l.amount), 0);

  for (const line of yearLines) {
    let account = byExternal.get(line.accountId);
    if (!account) {
      account = await prisma.ledgerAccount.create({
        data: { entityId: input.entityId, externalId: line.accountId, name: line.accountName },
      });
      byExternal.set(line.accountId, account);
    }
    if (!account.mappedReportingAccountId) {
      skipped += 1;
      skippedAccounts.add(line.accountName);
      continue;
    }
    const raId = account.mappedReportingAccountId;
    const row = monthlyByReporting.get(raId) ?? {};
    row[line.month] = (row[line.month] ?? 0) + line.amount;
    monthlyByReporting.set(raId, row);
    imported += 1;
  }

  const label = `${chosen.name} (QBO import)`;
  let budget;
  try {
    budget = await createBudget({ entityId: input.entityId, fiscalYear: input.fiscalYear, label });
  } catch {
    // Label collision — disambiguate with a timestamp-free counter suffix.
    budget = await createBudget({
      entityId: input.entityId,
      fiscalYear: input.fiscalYear,
      label: `${label} #${(await prisma.budget.count({ where: { entityId: input.entityId, fiscalYear: input.fiscalYear } })) + 1}`,
    });
  }

  await saveBudgetLinesBulk(
    budget.id,
    Array.from(monthlyByReporting.entries()).map(([reportingAccountId, monthly]) => ({ reportingAccountId, monthly })),
  );

  return {
    ok: true as const,
    budgetId: budget.id,
    imported,
    skipped,
    skippedAccounts: Array.from(skippedAccounts),
    qboBudgetName: chosen.name,
    rawLineCount,
    totalPulled,
  };
}
