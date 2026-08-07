import { prisma } from "@/lib/prisma";
import type { GlLine } from "@/lib/pace/qbo";

/**
 * General-ledger storage + query. Transaction detail behind the TB/statements,
 * for drill-down and bottoms-up forecasting. Idempotent per month: importing a
 * month replaces that month's lines for the entity (mirrors the TB import).
 */

function monthStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Replace an entity's GL for one month with a fresh set of parsed lines. */
export async function importGeneralLedger(input: {
  entityId: string;
  periodMonthISO: string;
  lines: GlLine[];
}): Promise<{ ok: true; count: number; unresolved: number }> {
  const periodMonth = monthStart(input.periodMonthISO);

  // Resolve QBO account id → our LedgerAccount id (accounts are synced first).
  const accounts = await prisma.ledgerAccount.findMany({
    where: { entityId: input.entityId },
    select: { id: true, externalId: true, name: true },
  });
  const byExternal = new Map(accounts.map((a) => [a.externalId, a]));
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));

  let unresolved = 0;
  const data = input.lines.map((l) => {
    const acct =
      (l.externalAccountId ? byExternal.get(l.externalAccountId) : undefined) ??
      (l.accountName ? byName.get(l.accountName.toLowerCase()) : undefined);
    if (!acct) unresolved += 1;
    return {
      entityId: input.entityId,
      ledgerAccountId: acct?.id ?? null,
      periodMonth,
      txnDate: new Date(`${l.txnDate}T00:00:00Z`),
      txnType: l.txnType ?? null,
      docNumber: l.docNumber ?? null,
      name: l.name ?? null,
      memo: l.memo ?? null,
      splitAccount: l.splitAccount ?? null,
      amount: l.amount,
      externalTxnId: l.externalTxnId ?? null,
      source: "qbo",
    };
  });

  await prisma.$transaction([
    prisma.generalLedgerLine.deleteMany({ where: { entityId: input.entityId, periodMonth } }),
    ...(data.length ? [prisma.generalLedgerLine.createMany({ data })] : []),
  ]);

  return { ok: true, count: data.length, unresolved };
}

export type GlRow = {
  id: string;
  entity: string;
  txnDate: string;
  txnType: string | null;
  docNumber: string | null;
  name: string | null;
  memo: string | null;
  splitAccount: string | null;
  amount: number;
  sourceAccount: string | null;
  sourceAcctNum: string | null;
  reportingAccount: string | null;
};

/**
 * Query GL lines with optional filters. `reportingAccountId` filters by the
 * mapped reporting account (drill-down from a statement line); `ledgerAccountId`
 * by the raw source account. Month range is inclusive "YYYY-MM".
 */
export async function queryGeneralLedger(filters: {
  entityId?: string | null; // null/undefined = all entities (consolidated drill)
  reportingAccountId?: string;
  ledgerAccountId?: string;
  fromMonth?: string; // "YYYY-MM"
  toMonth?: string; // "YYYY-MM"
  limit?: number;
}): Promise<{ rows: GlRow[]; total: number; count: number }> {
  const where: Record<string, unknown> = {};
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.ledgerAccountId) where.ledgerAccountId = filters.ledgerAccountId;
  if (filters.reportingAccountId) {
    where.ledgerAccount = { mappedReportingAccountId: filters.reportingAccountId };
  }
  if (filters.fromMonth || filters.toMonth) {
    const range: Record<string, Date> = {};
    if (filters.fromMonth) range.gte = new Date(`${filters.fromMonth}-01T00:00:00Z`);
    if (filters.toMonth) {
      const [y, m] = filters.toMonth.split("-").map(Number);
      range.lte = new Date(Date.UTC(y, m, 0)); // last day of toMonth
    }
    where.txnDate = range;
  }

  const limit = Math.min(filters.limit ?? 500, 2000);
  const [lines, agg, count] = await Promise.all([
    prisma.generalLedgerLine.findMany({
      where,
      orderBy: [{ txnDate: "asc" }, { id: "asc" }],
      take: limit,
      include: {
        entity: { select: { name: true } },
        ledgerAccount: { select: { name: true, acctNum: true, reportingAccount: { select: { code: true, name: true } } } },
      },
    }),
    prisma.generalLedgerLine.aggregate({ where, _sum: { amount: true } }),
    prisma.generalLedgerLine.count({ where }),
  ]);

  const rows: GlRow[] = lines.map((l) => ({
    id: l.id,
    entity: l.entity.name,
    txnDate: l.txnDate.toISOString().slice(0, 10),
    txnType: l.txnType,
    docNumber: l.docNumber,
    name: l.name,
    memo: l.memo,
    splitAccount: l.splitAccount,
    amount: Number(l.amount),
    sourceAccount: l.ledgerAccount?.name ?? null,
    sourceAcctNum: l.ledgerAccount?.acctNum ?? null,
    reportingAccount: l.ledgerAccount?.reportingAccount
      ? `${l.ledgerAccount.reportingAccount.code ? l.ledgerAccount.reportingAccount.code + " · " : ""}${l.ledgerAccount.reportingAccount.name}`
      : null,
  }));

  return { rows, total: Number(agg._sum.amount ?? 0), count };
}

/** Distinct months (YYYY-MM) that have GL loaded, newest first. */
export async function glMonths(entityId?: string): Promise<string[]> {
  const lines = await prisma.generalLedgerLine.findMany({
    where: entityId ? { entityId } : {},
    select: { periodMonth: true },
    orderBy: { periodMonth: "desc" },
    distinct: ["periodMonth"],
  });
  return lines.map((l) => l.periodMonth.toISOString().slice(0, 7));
}
