import { prisma } from "@/lib/prisma";
import { REPORTING_COA_SEED } from "@/lib/pace-taxonomy";

/**
 * Reporting COA management + the account-mapping layer (exception queue lives
 * here as "unmapped ledger accounts").
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

/** Map (or re-map) a source ledger account to a reporting account. */
export async function mapAccount(ledgerAccountId: string, reportingAccountId: string | null) {
  return prisma.ledgerAccount.update({
    where: { id: ledgerAccountId },
    data: { mappedReportingAccountId: reportingAccountId },
  });
}

/** The exception queue: source accounts not yet mapped to the reporting COA. */
export async function unmappedAccounts(entityId?: string) {
  return prisma.ledgerAccount.findMany({
    where: { mappedReportingAccountId: null, active: true, ...(entityId ? { entityId } : {}) },
    include: { entity: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}
