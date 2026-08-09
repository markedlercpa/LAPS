"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { importTrialBalance, type TbRow } from "@/lib/pace/import";
import { qboConfigured, authorizeUrl, pullTrialBalance } from "@/lib/pace/qbo";
import { syncEntityActuals } from "@/lib/pace/sync";
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

/**
 * QBO actuals sync (interactive). Incremental by default via `syncEntityActuals`
 * — on a routine refresh it re-pulls only the months whose transactions changed
 * (ChangeDataCapture) since the last sync, plus the current month; falls back to
 * a full trailing-N-month backfill on the first sync, when the last sync predates
 * CDC's ~30-day window, or when `full` is forced. Pass `{ full: true }` to force
 * a complete re-pull.
 */
export async function syncQboActualsAction(entityId: string, monthsBack = 24, opts?: { full?: boolean }) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!qboConfigured()) return { ok: false as const, error: "QuickBooks is not configured." };

  const res = await syncEntityActuals(entityId, { monthsBack, full: opts?.full });
  if (res.ok) {
    revalidatePath("/finance/actuals");
    revalidatePath("/finance/review");
    revalidatePath("/finance/ledger");
  }
  return res;
}
