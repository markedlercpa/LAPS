"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createBudget, saveBudgetLinesBulk, setBudgetStatus, deleteBudget, importQboBudget } from "@/lib/pace/budgets";
import { upsertNote, draftNarrative } from "@/lib/pace/narratives";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const createSchema = z.object({
  entityId: z.string().min(1),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  label: z.string().min(1, "Give the version a label"),
  kind: z.enum(["ORIGINAL", "REFORECAST", "SCENARIO"]).default("ORIGINAL"),
  copyFromId: z.string().optional(),
});

export async function createBudgetAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  try {
    const budget = await createBudget(parsed.data);
    revalidatePath("/finance/budgets");
    return { ok: true as const, id: budget.id };
  } catch {
    return { ok: false as const, error: "A budget with that label already exists for this entity/year." };
  }
}

export async function saveBudgetGridAction(
  budgetId: string,
  lines: { ledgerAccountId: string; monthly: Record<string, number> }[],
) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const res = await saveBudgetLinesBulk(budgetId, lines);
  revalidatePath(`/finance/budgets/${budgetId}`);
  return res;
}

const importQboSchema = z.object({
  entityId: z.string().min(1),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  budgetName: z.string().optional(),
});

/** List the QBO budgets available for an entity (name + fiscal years covered). */
export async function listQboBudgetsAction(entityId: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const { pullBudget } = await import("@/lib/pace/qbo");
  const budgets = await pullBudget(entityId);
  if (!budgets) return { ok: false as const, error: "QBO not connected for this entity, or the pull failed." };
  return {
    ok: true as const,
    budgets: budgets.map((b) => ({
      name: b.name,
      years: Array.from(new Set(b.lines.map((l) => Number(l.month.slice(0, 4))))).sort((a, z) => z - a),
    })),
  };
}

export async function importQboBudgetAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = importQboSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const res = await importQboBudget(parsed.data);
  if (res.ok) revalidatePath("/finance/budgets");
  return res;
}

export async function setBudgetStatusAction(budgetId: string, locked: boolean) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await setBudgetStatus(budgetId, locked);
  revalidatePath(`/finance/budgets/${budgetId}`);
  revalidatePath("/finance/budgets");
  return { ok: true as const };
}

export async function deleteBudgetAction(budgetId: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const res = await deleteBudget(budgetId);
  if (res.ok) revalidatePath("/finance/budgets");
  return res;
}

// ── Variance narratives ───────────────────────────────────────────────────

const noteSchema = z.object({
  entityId: z.string().min(1),
  accountKey: z.string().min(1),
  periodMonthISO: z.string().min(1),
  text: z.string().min(1, "Explanation is empty"),
  aiDrafted: z.boolean().optional(),
});

export async function saveNarrativeAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await upsertNote({ ...parsed.data, authorId: userId });
  revalidatePath("/finance/variance");
  revalidatePath("/finance/review");
  return { ok: true as const };
}

export async function draftNarrativeAction(input: {
  accountName: string;
  actual: number;
  budget: number;
  varianceAmt: number;
  variancePct: number | null;
  favorable: boolean | null;
  periodLabel: string;
  entityName: string;
}) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  return draftNarrative(input);
}
