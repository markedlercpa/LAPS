import type { BudgetKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyAccount, SECTION_LABELS, type QboSection } from "@/lib/pace/qbo-taxonomy";

/**
 * Budgets — planned natively at the QuickBooks (ledger) account level, per
 * entity and fiscal year, so they tie to the statements and budget-vs-actual
 * compares account-to-account with zero translation. Twelve monthly amounts per
 * account (calendar fiscal year), versioned and lockable.
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
    data: { entityId: input.entityId, fiscalYear: input.fiscalYear, label: input.label, kind: input.kind ?? "ORIGINAL" },
  });
  if (input.copyFromId) {
    const src = await prisma.budgetLine.findMany({ where: { budgetId: input.copyFromId } });
    if (src.length) {
      await prisma.budgetLine.createMany({
        data: src.map((l) => ({ budgetId: budget.id, ledgerAccountId: l.ledgerAccountId, monthly: l.monthly ?? {} })),
      });
    }
  }
  return budget;
}

export type BudgetGridRow = {
  ledgerAccountId: string;
  acctNum: string | null;
  name: string;
  section: QboSection;
  sectionLabel: string;
  monthly: Record<string, number>;
};

/** The editable grid: the entity's QBO accounts (classified into sections),
 * each with its monthly row for the budget's fiscal year. */
export async function getBudgetGrid(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { entity: { select: { name: true } } } });
  if (!budget) return null;

  const [accounts, lines] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { entityId: budget.entityId, active: true },
      select: { id: true, acctNum: true, name: true, sourceType: true, classification: true },
    }),
    prisma.budgetLine.findMany({ where: { budgetId } }),
  ]);

  const byAccount = new Map(lines.map((l) => [l.ledgerAccountId, (l.monthly ?? {}) as Record<string, number>]));
  const months = fiscalMonths(budget.fiscalYear);

  const rows: BudgetGridRow[] = accounts
    .map((a) => {
      const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
      return {
        ledgerAccountId: a.id,
        acctNum: a.acctNum,
        name: a.name,
        section: def.section,
        sectionLabel: SECTION_LABELS[def.section],
        sortOrder: def.sortOrder,
        monthly: byAccount.get(a.id) ?? {},
      };
    })
    .sort((x, y) => x.sortOrder - y.sortOrder || (x.acctNum ?? "").localeCompare(y.acctNum ?? "") || x.name.localeCompare(y.name))
    .map(({ sortOrder: _sortOrder, ...r }) => r);

  return { budget, months, rows };
}

/** Upsert one account's twelve monthly amounts. Blocked when the budget is locked. */
export async function saveBudgetLine(budgetId: string, ledgerAccountId: string, monthly: Record<string, number>) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { status: true } });
  if (!budget) return { ok: false as const, error: "Budget not found" };
  if (budget.status === "LOCKED") return { ok: false as const, error: "Budget is locked — unlock to edit." };
  await prisma.budgetLine.upsert({
    where: { budgetId_ledgerAccountId: { budgetId, ledgerAccountId } },
    update: { monthly },
    create: { budgetId, ledgerAccountId, monthly },
  });
  return { ok: true as const };
}

/** Save the whole grid at once (one transaction). Blocked when locked. */
export async function saveBudgetLinesBulk(
  budgetId: string,
  lines: { ledgerAccountId: string; monthly: Record<string, number> }[],
) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { status: true } });
  if (!budget) return { ok: false as const, error: "Budget not found" };
  if (budget.status === "LOCKED") return { ok: false as const, error: "Budget is locked — unlock to edit." };
  await prisma.$transaction(
    lines.map((l) =>
      prisma.budgetLine.upsert({
        where: { budgetId_ledgerAccountId: { budgetId, ledgerAccountId: l.ledgerAccountId } },
        update: { monthly: l.monthly },
        create: { budgetId, ledgerAccountId: l.ledgerAccountId, monthly: l.monthly },
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

/**
 * Import a QBO budget into a new PACE budget version. Because budgets are now
 * native, each QBO budget account maps directly to the entity's LedgerAccount by
 * its QBO account id (externalId) — no reporting-COA translation. Accounts are
 * synced first so every budgeted account exists; anything still unmatched is
 * reported, never silently dropped.
 */
export async function importQboBudget(input: { entityId: string; fiscalYear: number; budgetName?: string }) {
  const { pullBudget, syncLedgerAccounts } = await import("@/lib/pace/qbo");
  await syncLedgerAccounts(input.entityId).catch(() => null);
  const budgets = await pullBudget(input.entityId);
  if (!budgets) return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
  if (budgets.length === 0) return { ok: false as const, error: "No budgets found in QuickBooks for this company." };

  const chosen = input.budgetName ? budgets.find((b) => b.name === input.budgetName) ?? budgets[0] : budgets[0];
  const yearLines = chosen.lines.filter((l) => l.month.startsWith(String(input.fiscalYear)));
  if (yearLines.length === 0) {
    return { ok: false as const, error: `QBO budget "${chosen.name}" has no lines for FY${input.fiscalYear}.` };
  }

  const accounts = await prisma.ledgerAccount.findMany({ where: { entityId: input.entityId }, select: { id: true, externalId: true } });
  const byExternal = new Map(accounts.map((a) => [a.externalId, a.id]));

  const monthlyByAccount = new Map<string, Record<string, number>>();
  let imported = 0;
  let skipped = 0;
  const skippedAccounts = new Set<string>();
  const rawLineCount = yearLines.length;
  const totalPulled = yearLines.reduce((s, l) => s + Math.abs(l.amount), 0);

  for (const line of yearLines) {
    const ledgerAccountId = byExternal.get(line.accountId);
    if (!ledgerAccountId) {
      skipped += 1;
      skippedAccounts.add(line.accountName);
      continue;
    }
    const row = monthlyByAccount.get(ledgerAccountId) ?? {};
    row[line.month] = (row[line.month] ?? 0) + line.amount;
    monthlyByAccount.set(ledgerAccountId, row);
    imported += 1;
  }

  const label = `${chosen.name} (QBO import)`;
  let budget;
  try {
    budget = await createBudget({ entityId: input.entityId, fiscalYear: input.fiscalYear, label });
  } catch {
    budget = await createBudget({
      entityId: input.entityId,
      fiscalYear: input.fiscalYear,
      label: `${label} #${(await prisma.budget.count({ where: { entityId: input.entityId, fiscalYear: input.fiscalYear } })) + 1}`,
    });
  }

  await saveBudgetLinesBulk(
    budget.id,
    Array.from(monthlyByAccount.entries()).map(([ledgerAccountId, monthly]) => ({ ledgerAccountId, monthly })),
  );

  return { ok: true as const, budgetId: budget.id, imported, skipped, skippedAccounts: Array.from(skippedAccounts), qboBudgetName: chosen.name, rawLineCount, totalPulled };
}
