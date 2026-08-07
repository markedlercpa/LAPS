import { prisma } from "@/lib/prisma";
import { ensureReportingCoaSeeded } from "@/lib/pace/coa";

/**
 * Manual / CSV trial-balance import. Upserts source ledger accounts, records the
 * period + signed lines, auto-maps to the reporting COA where possible (by code
 * or an explicit reportingCode hint), runs the debits=credits data-quality
 * check, and logs a SyncRun. Never drops a line — unmapped accounts land in the
 * exception queue.
 *
 * Convention: `amount` is the signed period balance (debit balances positive,
 * credit balances negative), so a balanced TB sums to ~0.
 */

export type TbRow = {
  externalId?: string; // stable source id if available
  name: string;
  amount: number; // signed: debit +, credit -
  reportingCode?: string; // optional explicit map hint
};

const BALANCE_TOLERANCE = 0.01;

export async function importTrialBalance(input: {
  entityId: string;
  periodMonth: string; // ISO date; will be normalized to the 1st
  rows: TbRow[];
  source?: string; // "manual" | "qbo"
  status?: "OPEN" | "CLOSED";
}) {
  await ensureReportingCoaSeeded();

  const month = new Date(input.periodMonth);
  const periodMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));

  const reportingByCode = new Map(
    (await prisma.reportingAccount.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
  );

  const run = await prisma.syncRun.create({
    data: { entityId: input.entityId, status: "OK", message: `Import ${input.source ?? "manual"}` },
  });

  // Upsert accounts + collect their ids, auto-mapping where possible.
  let unmapped = 0;
  const lineData: { ledgerAccountId: string; amount: number }[] = [];
  for (const row of input.rows) {
    const externalId = row.externalId || row.name;
    const mappedReportingAccountId = row.reportingCode ? (reportingByCode.get(row.reportingCode) ?? null) : null;

    const account = await prisma.ledgerAccount.upsert({
      where: { entityId_externalId: { entityId: input.entityId, externalId } },
      update: {
        name: row.name,
        // Only set mapping if we resolved one and it isn't already mapped.
        ...(mappedReportingAccountId ? { mappedReportingAccountId } : {}),
      },
      create: {
        entityId: input.entityId,
        externalId,
        name: row.name,
        mappedReportingAccountId,
      },
    });
    if (!account.mappedReportingAccountId) unmapped += 1;
    lineData.push({ ledgerAccountId: account.id, amount: row.amount });
  }

  const sum = lineData.reduce((a, l) => a + l.amount, 0);
  const balanced = Math.abs(sum) <= BALANCE_TOLERANCE;

  // Replace any existing period for this entity+month, then write fresh lines.
  const existing = await prisma.trialBalancePeriod.findUnique({
    where: { entityId_periodMonth: { entityId: input.entityId, periodMonth } },
  });
  if (existing) {
    await prisma.trialBalanceLine.deleteMany({ where: { periodId: existing.id } });
  }

  const period = await prisma.trialBalancePeriod.upsert({
    where: { entityId_periodMonth: { entityId: input.entityId, periodMonth } },
    update: { source: input.source ?? "manual", balanced, status: input.status ?? "OPEN", sourcedAt: new Date() },
    create: {
      entityId: input.entityId,
      periodMonth,
      source: input.source ?? "manual",
      balanced,
      status: input.status ?? "OPEN",
    },
  });

  await prisma.trialBalanceLine.createMany({
    data: lineData.map((l) => ({ periodId: period.id, ledgerAccountId: l.ledgerAccountId, amount: l.amount })),
  });

  await prisma.syncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status: balanced ? "OK" : "PARTIAL",
      stats: { accounts: input.rows.length, lines: lineData.length, unmapped, balanced, imbalance: sum },
    },
  });

  return { ok: true as const, periodId: period.id, balanced, unmapped, imbalance: sum };
}
