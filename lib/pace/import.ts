import { prisma } from "@/lib/prisma";

/**
 * Manual / CSV / QBO trial-balance import. Upserts source ledger accounts
 * (carrying QBO's descriptive metadata — AccountType/SubType/Classification —
 * so statements rebuild natively with no mapping), records the period + signed
 * lines, runs the debits=credits data-quality check, and logs a SyncRun. Never
 * drops a line.
 *
 * Convention: `amount` is the signed period balance (debit balances positive,
 * credit balances negative), so a balanced TB sums to ~0.
 */

export type TbRow = {
  externalId?: string; // stable source id if available
  name: string;
  amount: number; // signed: debit +, credit -
  acctNum?: string; // source account number (QBO AcctNum), for display + sort
  // QBO descriptive metadata (drives native classification). Optional so a bare
  // manual CSV still imports — such accounts land in the "Unclassified" section.
  accountType?: string;
  accountSubType?: string;
  classification?: string;
  fqName?: string;
  parentExternalId?: string;
};

const BALANCE_TOLERANCE = 0.01;

export async function importTrialBalance(input: {
  entityId: string;
  periodMonth: string; // ISO date; will be normalized to the 1st
  rows: TbRow[];
  source?: string; // "manual" | "qbo"
  status?: "OPEN" | "CLOSED";
}) {
  const month = new Date(input.periodMonth);
  const periodMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));

  const run = await prisma.syncRun.create({
    data: { entityId: input.entityId, status: "OK", message: `Import ${input.source ?? "manual"}` },
  });

  // Upsert accounts (with QBO metadata) + collect their ids. Metadata is only
  // written when present so a bare manual re-import never wipes a QBO sync's
  // classification.
  let unclassified = 0;
  const lineData: { ledgerAccountId: string; amount: number }[] = [];
  for (const row of input.rows) {
    const externalId = row.externalId || row.name;
    const meta = {
      ...(row.acctNum ? { acctNum: row.acctNum } : {}),
      ...(row.accountType ? { sourceType: row.accountType } : {}),
      ...(row.accountSubType ? { accountSubType: row.accountSubType } : {}),
      ...(row.classification ? { classification: row.classification } : {}),
      ...(row.fqName ? { fqName: row.fqName } : {}),
      ...(row.parentExternalId ? { parentExternalId: row.parentExternalId } : {}),
    };

    const account = await prisma.ledgerAccount.upsert({
      where: { entityId_externalId: { entityId: input.entityId, externalId } },
      update: { name: row.name, ...meta },
      create: { entityId: input.entityId, externalId, name: row.name, acctNum: row.acctNum ?? null, ...meta },
    });
    if (!account.sourceType && !account.classification) unclassified += 1;
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
      stats: { accounts: input.rows.length, lines: lineData.length, unclassified, balanced, imbalance: sum },
    },
  });

  return { ok: true as const, periodId: period.id, balanced, unclassified, imbalance: sum };
}
