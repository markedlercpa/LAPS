"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { ProspectStatus, ProspectResearchStatus } from "@prisma/client";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const prospectSchema = z.object({
  companyName: z.string().min(1, "Company is required"),
  contactName: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  tier: z.enum(["A", "B", "C"]).default("B"),
  revenueEstimate: z.coerce.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
  headcountEstimate: z.coerce.number().int().nonnegative().optional().or(z.nan().transform(() => undefined)),
  source: z.string().optional(),
  notes: z.string().optional(),
});

function clean(d: z.infer<typeof prospectSchema>) {
  return {
    companyName: d.companyName,
    contactName: d.contactName || null,
    title: d.title || null,
    email: d.email || null,
    phone: d.phone || null,
    website: d.website || null,
    industry: d.industry || null,
    tier: d.tier,
    revenueEstimate: d.revenueEstimate == null || Number.isNaN(d.revenueEstimate) ? null : d.revenueEstimate,
    headcountEstimate: d.headcountEstimate == null || Number.isNaN(d.headcountEstimate) ? null : d.headcountEstimate,
    source: d.source || null,
    notes: d.notes || null,
  };
}

export async function createProspect(input: unknown) {
  const parsed = prospectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const ownerId = await currentUserId();
  const p = await prisma.prospect.create({ data: { ...clean(parsed.data), ownerId } });
  revalidatePath("/prospecting");
  return { ok: true as const, id: p.id };
}

export async function updateProspectStatus(id: string, status: ProspectStatus) {
  await prisma.prospect.update({ where: { id }, data: { status } });
  revalidatePath("/prospecting");
  return { ok: true as const };
}

export async function deleteProspect(id: string) {
  await prisma.prospect.delete({ where: { id } });
  revalidatePath("/prospecting");
  return { ok: true as const };
}

// ── Top-of-funnel research ───────────────────────────────────────────────────
const researchSchema = z.object({
  id: z.string().min(1),
  contactName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  tier: z.enum(["A", "B", "C"]).optional(),
  revenueEstimate: z.coerce.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
  headcountEstimate: z.coerce.number().int().nonnegative().optional().or(z.nan().transform(() => undefined)),
  researchStatus: z.enum(["TO_RESEARCH", "RESEARCHED", "READY"]).optional(),
  signal: z.string().optional().nullable(),
  fitNotes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

/** Save the research write-up + account details on a prospect. */
export async function updateProspectResearch(input: unknown) {
  if (!(await currentUserId())) return { ok: false as const, error: "Not signed in" };
  const parsed = researchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...d } = parsed.data;
  await prisma.prospect.update({
    where: { id },
    data: {
      ...(d.contactName !== undefined ? { contactName: d.contactName || null } : {}),
      ...(d.title !== undefined ? { title: d.title || null } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(d.website !== undefined ? { website: d.website || null } : {}),
      ...(d.linkedinUrl !== undefined ? { linkedinUrl: d.linkedinUrl || null } : {}),
      ...(d.industry !== undefined ? { industry: d.industry || null } : {}),
      ...(d.tier !== undefined ? { tier: d.tier } : {}),
      ...(d.revenueEstimate !== undefined ? { revenueEstimate: Number.isNaN(d.revenueEstimate) ? null : d.revenueEstimate ?? null } : {}),
      ...(d.headcountEstimate !== undefined ? { headcountEstimate: Number.isNaN(d.headcountEstimate as number) ? null : d.headcountEstimate ?? null } : {}),
      ...(d.researchStatus !== undefined ? { researchStatus: d.researchStatus } : {}),
      ...(d.signal !== undefined ? { signal: d.signal || null } : {}),
      ...(d.fitNotes !== undefined ? { fitNotes: d.fitNotes || null } : {}),
      ...(d.tags !== undefined ? { tags: d.tags } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });
  revalidatePath("/prospecting");
  revalidatePath(`/prospecting/${id}`);
  return { ok: true as const };
}

export async function setResearchStatus(id: string, researchStatus: ProspectResearchStatus) {
  await prisma.prospect.update({ where: { id }, data: { researchStatus } });
  revalidatePath("/prospecting");
  revalidatePath(`/prospecting/${id}`);
  return { ok: true as const };
}

const touchSchema = z.object({
  prospectId: z.string().min(1),
  kind: z.enum(["note", "research", "call", "email", "linkedin"]).default("note"),
  body: z.string().min(1, "Add a note"),
});

/** Log a research/outreach touch (the top-of-funnel activity log). */
export async function addProspectTouch(input: unknown) {
  const byUserId = await currentUserId();
  const parsed = touchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.prospectTouch.create({ data: { prospectId: parsed.data.prospectId, kind: parsed.data.kind, body: parsed.data.body, byUserId } });
  revalidatePath(`/prospecting/${parsed.data.prospectId}`);
  return { ok: true as const };
}

export async function deleteProspectTouch(id: string, prospectId: string) {
  await prisma.prospectTouch.delete({ where: { id } });
  revalidatePath(`/prospecting/${prospectId}`);
  return { ok: true as const };
}

/**
 * Promote a cold prospect into a real Lead (they engaged). Copies over the
 * sizing estimates, links the two, and marks the prospect PROMOTED.
 */
export async function promoteProspect(id: string) {
  const ownerId = await currentUserId();
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return { ok: false as const, error: "Prospect not found" };
  if (p.promotedLeadId) return { ok: true as const, leadId: p.promotedLeadId };

  const [firstName, ...rest] = (p.contactName ?? p.companyName).split(" ");
  const lead = await prisma.lead.create({
    data: {
      firstName: firstName || p.companyName,
      lastName: rest.join(" ") || "",
      companyName: p.companyName,
      email: p.email,
      phone: p.phone,
      leadSource: p.source ?? "Prospecting (Dream 100)",
      revenueEstimate: p.revenueEstimate,
      headcountEstimate: p.headcountEstimate,
      ownerId: p.ownerId ?? ownerId,
    },
  });
  await prisma.prospect.update({ where: { id }, data: { status: "PROMOTED", promotedLeadId: lead.id } });
  revalidatePath("/prospecting");
  revalidatePath("/leads");
  return { ok: true as const, leadId: lead.id };
}

/**
 * Bulk import cold prospects from pasted CSV. Header row optional; recognized
 * columns (case-insensitive): company, contact, title, email, phone, website,
 * industry, tier, revenue, headcount. Company is required; unknown columns are
 * ignored. `source` tags the whole batch.
 */
export async function importProspectsCsv(csv: string, source?: string) {
  const ownerId = await currentUserId();
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false as const, error: "Nothing to import." };

  const HEADERS = ["company", "contact", "title", "email", "phone", "website", "industry", "tier", "revenue", "headcount"];
  const first = lines[0].toLowerCase();
  const hasHeader = HEADERS.some((h) => first.includes(h));
  const cols = hasHeader ? lines[0].split(",").map((c) => c.trim().toLowerCase()) : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const idx = (name: string, fallback: number) => (cols ? (cols.indexOf(name) === -1 ? -1 : cols.indexOf(name)) : fallback);
  const map = {
    company: idx("company", 0),
    contact: idx("contact", 1),
    title: idx("title", 2),
    email: idx("email", 3),
    phone: idx("phone", 4),
    website: idx("website", 5),
    industry: idx("industry", 6),
    tier: idx("tier", 7),
    revenue: idx("revenue", 8),
    headcount: idx("headcount", 9),
  };

  let created = 0;
  const rows = dataLines.map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const at = (i: number) => (i >= 0 ? cells[i] : undefined) || undefined;
    const company = at(map.company);
    if (!company) return null;
    const tierRaw = (at(map.tier) ?? "B").toUpperCase();
    const rev = Number(String(at(map.revenue) ?? "").replace(/[$,]/g, ""));
    const head = Number(String(at(map.headcount) ?? "").replace(/[,]/g, ""));
    return {
      companyName: company,
      contactName: at(map.contact) ?? null,
      title: at(map.title) ?? null,
      email: at(map.email) ?? null,
      phone: at(map.phone) ?? null,
      website: at(map.website) ?? null,
      industry: at(map.industry) ?? null,
      tier: ["A", "B", "C"].includes(tierRaw) ? tierRaw : "B",
      revenueEstimate: Number.isFinite(rev) && rev > 0 ? rev : null,
      headcountEstimate: Number.isFinite(head) && head > 0 ? Math.round(head) : null,
      source: source || "Import",
      ownerId,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) {
    const res = await prisma.prospect.createMany({ data: rows });
    created = res.count;
  }
  revalidatePath("/prospecting");
  return { ok: true as const, created, skipped: dataLines.length - created };
}
