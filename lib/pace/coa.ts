import { prisma } from "@/lib/prisma";
import { REPORTING_COA_SEED } from "@/lib/pace-taxonomy";

/**
 * Reporting COA management. The reporting chart of accounts is the budgeting
 * dimension (budgets + budget-vs-actual). Actuals are NOT mapped here — the
 * statements are rebuilt natively from QuickBooks' own account metadata (see
 * lib/pace/qbo-taxonomy.ts).
 */

let seeded = false;

/** Lazily upsert the firm-standard reporting COA (idempotent, by code). */
export async function ensureReportingCoaSeeded(): Promise<void> {
  if (seeded) return;
  const count = await prisma.reportingAccount.count();
  if (count === 0) {
    for (const a of REPORTING_COA_SEED) {
      await prisma.reportingAccount.upsert({
        where: { code: a.code },
        update: {},
        create: {
          code: a.code,
          name: a.name,
          statement: a.statement,
          type: a.type,
          category: a.category ?? null,
          subcategory: a.subcategory ?? null,
          naturalSide: a.naturalSide,
          sortOrder: a.sortOrder,
        },
      });
    }
  }
  seeded = true;
}

export async function listReportingAccounts() {
  await ensureReportingCoaSeeded();
  return prisma.reportingAccount.findMany({ orderBy: { sortOrder: "asc" } });
}
