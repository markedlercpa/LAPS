"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { importTrialBalance, type TbRow } from "@/lib/pace/import";
import { qboConfigured, authorizeUrl, pullTrialBalance, pullGeneralLedger, syncLedgerAccounts } from "@/lib/pace/qbo";
import { importGeneralLedger } from "@/lib/pace/gl";
import { ENTITY_KINDS } from "@/lib/pace-taxonomy";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const entitySchema = z.object({
  name: z.string().min(1, "Entity name is required"),
  kind: z.enum(ENTITY_KINDS).default("operating"),
});

export async function createEntity(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = entitySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const entity = await prisma.entity.create({
    data: { name: parsed.data.name, kind: parsed.data.kind, connection: { create: {} } },
  });
  revalidatePath("/finance/entities");
  return { ok: true as const, id: entity.id };
}

/**
 * Parse a trial-balance CSV. Accepts, per line:
 *   name, amount [, accountType]        (signed amount: debit +, credit -)
 *   name, debit, credit [, accountType] (two numbers → amount = debit - credit)
 * The optional trailing text is treated as a QuickBooks AccountType hint (e.g.
 * "Bank", "Income", "Expense") so a manually-pasted TB still classifies onto the
 * statements. Omit it and the account lands in the "Unclassified" section.
 */
function parseCsv(text: string): TbRow[] {
  const rows: TbRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 2) continue;
    const name = cells[0];
    if (!name || /^(account|name)$/i.test(name)) continue; // skip header
    const nums: number[] = [];
    let accountType: string | undefined;
    for (const cell of cells.slice(1)) {
      if (!cell) continue;
      // Accounting style: $, thousands commas already split — and (123) = -123.
      const neg = /^\(.*\)$/.test(cell);
      const cleaned = cell.replace(/[$()]/g, "");
      const n = Number(cleaned);
      if (cleaned !== "" && !Number.isNaN(n)) nums.push(neg ? -n : n);
      else accountType = cell;
    }
    let amount: number;
    if (nums.length >= 2) amount = nums[0] - nums[1]; // debit, credit
    else if (nums.length === 1) amount = nums[0]; // signed
    else continue;
    rows.push({ name, amount, accountType });
  }
  return rows;
}

const importSchema = z.object({
  entityId: z.string().min(1),
  periodMonth: z.string().min(1), // YYYY-MM or ISO
  csv: z.string().min(1, "Paste trial-balance rows"),
  status: z.enum(["OPEN", "CLOSED"]).default("OPEN"),
});

export async function importTrialBalanceAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) return { ok: false as const, error: "No rows parsed from the CSV." };
  const month = /^\d{4}-\d{2}$/.test(parsed.data.periodMonth)
    ? `${parsed.data.periodMonth}-01`
    : parsed.data.periodMonth;
  const res = await importTrialBalance({
    entityId: parsed.data.entityId,
    periodMonth: month,
    rows,
    source: "manual",
    status: parsed.data.status,
  });
  revalidatePath("/finance/actuals");
  return res;
}

/** Flip a trial-balance period open/closed (monthly close). */
export async function setPeriodStatusAction(entityId: string, periodMonthISO: string, closed: boolean) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const month = /^\d{4}-\d{2}$/.test(periodMonthISO) ? `${periodMonthISO}-01` : periodMonthISO;
  await prisma.trialBalancePeriod.updateMany({
    where: { entityId, periodMonth: new Date(month) },
    data: { status: closed ? "CLOSED" : "OPEN" },
  });
  revalidatePath("/finance/actuals");
  revalidatePath("/finance/review");
  return { ok: true as const };
}

/** Returns an Intuit authorize URL for the client to redirect to, or an error. */
export async function startQboConnect(entityId: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured (set QBO_CLIENT_ID/SECRET)." };
  const url = await authorizeUrl(entityId);
  if (!url) return { ok: false as const, error: "Could not build the authorize URL." };
  return { ok: true as const, url };
}

export async function triggerQboSync(entityId: string, periodMonth: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured." };
  const month = /^\d{4}-\d{2}$/.test(periodMonth) ? `${periodMonth}-01` : periodMonth;
  const rows = await pullTrialBalance(entityId, month);
  if (!rows) return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
  const res = await importTrialBalance({ entityId, periodMonth: month, rows, source: "qbo" });
  revalidatePath("/finance/actuals");
  return res;
}

/** First-of-month ISO strings for the trailing `count` months, oldest → newest. */
function trailingMonths(count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * One-click "bring in all data": pull the trailing N months of trial balances
 * from QBO for an entity (default 24), importing each month that has data. Also
 * syncs the chart of accounts first (numbers + mapping queue). No month needs to
 * be picked — this is what populates the month dropdown in the first place.
 */
export async function syncQboActualsAction(entityId: string, monthsBack = 24) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured." };

  await syncLedgerAccounts(entityId).catch(() => null);

  const months = trailingMonths(monthsBack);
  let imported = 0;
  let empty = 0;
  let failed = 0;
  let glLines = 0;
  const importedMonths: string[] = [];
  for (const month of months) {
    const rows = await pullTrialBalance(entityId, month);
    if (rows === null) {
      // null = not connected / pull failed. Bail early on the first month only;
      // otherwise treat as a transient miss and keep going.
      if (imported === 0 && empty === 0) {
        return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
      }
      failed += 1;
      continue;
    }
    if (rows.length === 0) {
      empty += 1;
      continue;
    }
    await importTrialBalance({ entityId, periodMonth: month, rows, source: "qbo" });
    imported += 1;
    importedMonths.push(month.slice(0, 7));

    // Also pull the transaction-level general ledger for this month (drill-down
    // + bottoms-up forecasting). Best-effort: a GL miss never fails the TB sync.
    const monthStart = new Date(month);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const gl = await pullGeneralLedger(entityId, month, monthEnd).catch(() => null);
    if (gl && gl.length) {
      const res = await importGeneralLedger({ entityId, periodMonthISO: month, lines: gl }).catch(() => null);
      if (res) glLines += res.count;
    }
  }

  revalidatePath("/finance/actuals");
  revalidatePath("/finance/review");
  revalidatePath("/finance/ledger");
  return {
    ok: true as const,
    imported,
    empty,
    failed,
    glLines,
    firstMonth: importedMonths[0] ?? null,
    lastMonth: importedMonths[importedMonths.length - 1] ?? null,
  };
}
