"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setCashConfig, addCashLine, deleteCashLine } from "@/lib/pace/cash";
import { CASH_CATEGORY_MAP } from "@/lib/pace/cash-taxonomy";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const toCents = (v: number) => Math.round(v * 100);

const configSchema = z.object({
  useQboOpening: z.coerce.boolean().default(true),
  opening: z.coerce.number().default(0),
  openingAsOf: z.string().min(1),
  minCash: z.coerce.number().min(0).default(0),
  locLimit: z.coerce.number().min(0).default(0),
  locOpening: z.coerce.number().min(0).default(0),
  dnaMonthly: z.coerce.number().min(0).default(0),
  capexMonthly: z.coerce.number().min(0).default(0),
  arDays: z.coerce.number().int().min(0).max(365).default(45),
  apDays: z.coerce.number().int().min(0).max(365).default(30),
});

export async function setCashConfigAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  await setCashConfig({
    useQboOpening: d.useQboOpening,
    openingCents: toCents(d.opening),
    openingAsOf: d.openingAsOf,
    minCashCents: toCents(d.minCash),
    locLimitCents: toCents(d.locLimit),
    locOpeningCents: toCents(d.locOpening),
    dnaMonthlyCents: toCents(d.dnaMonthly),
    capexMonthlyCents: toCents(d.capexMonthly),
    arDays: d.arDays,
    apDays: d.apDays,
  });
  revalidatePath("/finance/cash");
  revalidatePath("/finance/cash/assumptions");
  return { ok: true as const };
}

const lineSchema = z.object({
  label: z.string().min(1, "Label is required"),
  category: z.string().refine((c) => !!CASH_CATEGORY_MAP[c], "Pick a category"),
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
  cadence: z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.string().min(1, "Pick a start date"),
  endDate: z.string().optional(),
  netTermsDays: z.coerce.number().int().min(0).max(180).optional().or(z.nan().transform(() => undefined)),
  paidWhenPaid: z.coerce.boolean().optional(),
});

export async function addCashLineAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await addCashLine({
    label: parsed.data.label,
    category: parsed.data.category,
    amountCents: toCents(parsed.data.amount),
    cadence: parsed.data.cadence,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate || null,
    netTermsDays: parsed.data.netTermsDays == null || Number.isNaN(parsed.data.netTermsDays) ? null : parsed.data.netTermsDays,
    paidWhenPaid: parsed.data.paidWhenPaid ?? false,
    createdBy: userId,
  });
  revalidatePath("/finance/cash");
  revalidatePath("/finance/cash/assumptions");
  return { ok: true as const };
}

export async function deleteCashLineAction(id: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await deleteCashLine(id);
  revalidatePath("/finance/cash");
  revalidatePath("/finance/cash/assumptions");
  return { ok: true as const };
}
