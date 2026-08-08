"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setCashPosition, addCashLine, deleteCashLine } from "@/lib/pace/cash";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const dollarsToCents = (v: number) => Math.round(v * 100);

const positionSchema = z.object({
  opening: z.coerce.number(),
  openingAsOf: z.string().min(1, "Pick a date"),
  minCash: z.coerce.number().min(0).default(0),
});

export async function setCashPositionAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await setCashPosition({
    openingCents: dollarsToCents(parsed.data.opening),
    openingAsOf: parsed.data.openingAsOf,
    minCashCents: dollarsToCents(parsed.data.minCash),
  });
  revalidatePath("/finance/cash");
  return { ok: true as const };
}

const lineSchema = z.object({
  label: z.string().min(1, "Label is required"),
  kind: z.enum(["INFLOW", "OUTFLOW"]),
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
  cadence: z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.string().min(1, "Pick a start date"),
  endDate: z.string().optional(),
  category: z.string().optional(),
});

export async function addCashLineAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await addCashLine({
    label: parsed.data.label,
    kind: parsed.data.kind,
    amountCents: dollarsToCents(parsed.data.amount),
    cadence: parsed.data.cadence,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate || null,
    category: parsed.data.category || null,
    createdBy: userId,
  });
  revalidatePath("/finance/cash");
  return { ok: true as const };
}

export async function deleteCashLineAction(id: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await deleteCashLine(id);
  revalidatePath("/finance/cash");
  return { ok: true as const };
}
