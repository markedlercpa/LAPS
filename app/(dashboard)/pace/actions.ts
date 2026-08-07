"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { importTrialBalance, type TbRow } from "@/lib/pace/import";
import { mapAccount } from "@/lib/pace/coa";
import { qboConfigured, authorizeUrl, pullTrialBalance, syncLedgerAccounts } from "@/lib/pace/qbo";
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
  revalidatePath("/pace/entities");
  return { ok: true as const, id: entity.id };
}

/**
 * Parse a trial-balance CSV. Accepts, per line:
 *   name, amount [, reportingCode]        (signed amount: debit +, credit -)
 *   name, debit, credit [, reportingCode] (two numbers → amount = debit - credit)
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
    let reportingCode: string | undefined;
    for (const cell of cells.slice(1)) {
      if (!cell) continue;
      // Accounting style: $, thousands commas already split — and (123) = -123.
      const neg = /^\(.*\)$/.test(cell);
      const cleaned = cell.replace(/[$()]/g, "");
      const n = Number(cleaned);
      if (cleaned !== "" && !Number.isNaN(n)) nums.push(neg ? -n : n);
      else reportingCode = cell;
    }
    let amount: number;
    if (nums.length >= 2) amount = nums[0] - nums[1]; // debit, credit
    else if (nums.length === 1) amount = nums[0]; // signed
    else continue;
    rows.push({ name, amount, reportingCode });
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
  revalidatePath("/pace/actuals");
  revalidatePath("/pace/mapping");
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
  revalidatePath("/pace/actuals");
  revalidatePath("/pace/review");
  return { ok: true as const };
}

export async function mapAccountAction(ledgerAccountId: string, reportingAccountId: string | null) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await mapAccount(ledgerAccountId, reportingAccountId);
  revalidatePath("/pace/mapping");
  revalidatePath("/pace/actuals");
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

/**
 * Pull the chart of accounts (with account numbers) from every QBO-connected
 * entity into the COA-mapping queue. Lets the user map accounts before importing
 * a budget or actuals, and backfills account numbers on existing accounts.
 */
export async function syncQboAccountsAction() {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured." };
  const conns = await prisma.ledgerConnection.findMany({
    where: { provider: "QBO", status: "connected" },
    select: { entityId: true },
  });
  if (conns.length === 0) return { ok: false as const, error: "No QBO-connected entities." };
  let synced = 0;
  for (const c of conns) {
    const n = await syncLedgerAccounts(c.entityId);
    if (n) synced += n;
  }
  revalidatePath("/pace/mapping");
  return { ok: true as const, synced };
}

export async function triggerQboSync(entityId: string, periodMonth: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured." };
  const month = /^\d{4}-\d{2}$/.test(periodMonth) ? `${periodMonth}-01` : periodMonth;
  const rows = await pullTrialBalance(entityId, month);
  if (!rows) return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
  const res = await importTrialBalance({ entityId, periodMonth: month, rows, source: "qbo" });
  revalidatePath("/pace/actuals");
  return res;
}
