"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createResource,
  createPortfolio,
  createEngagement,
  replaceEngagementBudget,
  addRoleBandRate,
  ensureRoleBandsSeeded,
} from "@/lib/work/capacity";
import { karbonConfigured, syncKarbonActuals } from "@/lib/work/karbon";
import { ENGAGEMENT_TYPES, REVENUE_RECOGNITION } from "@/lib/work-taxonomy";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const dollarsToCents = (v: number) => Math.round(v * 100);

const resourceSchema = z.object({
  personName: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  roleBandId: z.string().min(1, "Pick a role band"),
  weeklyCapacityHours: z.coerce.number().min(0).max(80).default(40),
  skillTags: z.array(z.string()).default([]),
  location: z.string().optional(),
  karbonUserId: z.string().optional(),
});

export async function createResourceAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  await ensureRoleBandsSeeded();
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  try {
    const r = await createResource({ ...parsed.data, createdBy: userId });
    revalidatePath("/work/capacity/resources");
    return { ok: true as const, id: r.id };
  } catch {
    return { ok: false as const, error: "A resource with that email already exists." };
  }
}

const portfolioSchema = z.object({
  name: z.string().min(1, "Name is required"),
  directorName: z.string().min(1, "Director name is required"),
  directorEmail: z.string().email("Valid email required"),
  directorCostAnnual: z.coerce.number().min(0).default(0),
  declaredRevenue: z.coerce.number().min(0).default(0),
  gpTargetPct: z.coerce.number().min(0).max(1).default(0.5),
});

export async function createPortfolioAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = portfolioSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const p = await createPortfolio({
    name: parsed.data.name,
    directorName: parsed.data.directorName,
    directorEmail: parsed.data.directorEmail,
    directorCostCentsAnnual: dollarsToCents(parsed.data.directorCostAnnual),
    declaredPortfolioRevenueCents: dollarsToCents(parsed.data.declaredRevenue),
    gpTargetPct: parsed.data.gpTargetPct,
    createdBy: userId,
  });
  revalidatePath("/work/capacity/portfolios");
  return { ok: true as const, id: p.id };
}

const engagementSchema = z.object({
  portfolioId: z.string().min(1, "Pick a portfolio"),
  clientName: z.string().min(1, "Client name is required"),
  engagementType: z.enum(ENGAGEMENT_TYPES).default("other"),
  revenue: z.coerce.number().min(0).default(0),
  revenueRecognition: z.enum(REVENUE_RECOGNITION).default("fixed_on_completion"),
  karbonWorkItemKey: z.string().optional(),
  startWeek: z.string().optional(),
  endWeek: z.string().optional(),
});

export async function createEngagementAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = engagementSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const e = await createEngagement({
    portfolioId: parsed.data.portfolioId,
    clientName: parsed.data.clientName,
    engagementType: parsed.data.engagementType,
    revenueCents: dollarsToCents(parsed.data.revenue),
    revenueRecognition: parsed.data.revenueRecognition,
    karbonWorkItemKey: parsed.data.karbonWorkItemKey || null,
    startWeek: parsed.data.startWeek || null,
    endWeek: parsed.data.endWeek || null,
    createdBy: userId,
  });
  revalidatePath("/work/capacity/engagements");
  return { ok: true as const, id: e.id };
}

const budgetSchema = z.object({
  engagementId: z.string().min(1),
  rows: z.array(z.object({ roleBandId: z.string().min(1), budgetedHours: z.coerce.number().min(0) })),
});

export async function saveEngagementBudgetAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const res = await replaceEngagementBudget(parsed.data.engagementId, parsed.data.rows);
  revalidatePath(`/work/capacity/engagements/${parsed.data.engagementId}`);
  return res;
}

const rateSchema = z.object({
  roleBandId: z.string().min(1),
  loadedRate: z.coerce.number().min(0),
  billRate: z.coerce.number().min(0).optional(),
  effectiveFrom: z.string().min(1),
  note: z.string().optional(),
});

export async function addRoleBandRateAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await addRoleBandRate({
    roleBandId: parsed.data.roleBandId,
    loadedRateCents: dollarsToCents(parsed.data.loadedRate),
    billRateCents: parsed.data.billRate != null ? dollarsToCents(parsed.data.billRate) : null,
    effectiveFrom: parsed.data.effectiveFrom,
    note: parsed.data.note || null,
  });
  revalidatePath("/work/capacity/admin");
  return { ok: true as const };
}

export async function triggerKarbonSyncAction() {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!karbonConfigured()) return { ok: false as const, error: "Karbon is not configured." };
  const res = await syncKarbonActuals();
  revalidatePath("/work/capacity/admin");
  revalidatePath("/work/capacity/engagements");
  return res;
}
