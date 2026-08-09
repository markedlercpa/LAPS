import { prisma } from "@/lib/prisma";
import type { LeadMagnetKind, LeadMagnetStatus, Prisma } from "@prisma/client";

/** URL-safe slug from a title; callers ensure uniqueness. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "magnet";
}

/** A unique slug, appending -2, -3, … if the base is taken (ignoring `exceptId`). */
export async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base);
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await prisma.leadMagnet.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === exceptId) return slug;
  }
  return `${root}-${Date.now()}`;
}

export type MagnetListRow = {
  id: string;
  kind: LeadMagnetKind;
  slug: string;
  title: string;
  status: LeadMagnetStatus;
  baseScore: number;
  submissions: number;
  leads: number;
  updatedAt: Date;
};

/** All magnets with submission + distinct-lead counts, newest first. */
export async function listMagnets(): Promise<MagnetListRow[]> {
  const magnets = await prisma.leadMagnet.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true } }, submissions: { select: { leadId: true } } },
  });
  return magnets.map((m) => ({
    id: m.id,
    kind: m.kind,
    slug: m.slug,
    title: m.title,
    status: m.status,
    baseScore: m.baseScore,
    submissions: m._count.submissions,
    leads: new Set(m.submissions.map((s) => s.leadId).filter(Boolean)).size,
    updatedAt: m.updatedAt,
  }));
}

export function getMagnet(id: string) {
  return prisma.leadMagnet.findUnique({ where: { id } });
}

/** Public lookup: published magnets only (drafts 404 for prospects). */
export function getPublishedMagnetBySlug(slug: string) {
  return prisma.leadMagnet.findFirst({ where: { slug, status: "PUBLISHED" } });
}

export async function createMagnet(input: {
  title: string;
  kind: LeadMagnetKind;
  baseScore: number;
  headline?: string | null;
  subhead?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
  createdBy?: string | null;
}) {
  const slug = await uniqueSlug(input.title);
  return prisma.leadMagnet.create({
    data: {
      title: input.title,
      kind: input.kind,
      baseScore: input.baseScore,
      slug,
      headline: input.headline ?? null,
      subhead: input.subhead ?? null,
      body: input.body ?? null,
      ctaLabel: input.ctaLabel ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function updateMagnet(id: string, patch: Prisma.LeadMagnetUpdateInput) {
  return prisma.leadMagnet.update({ where: { id }, data: patch });
}

export async function setMagnetStatus(id: string, status: LeadMagnetStatus) {
  return prisma.leadMagnet.update({ where: { id }, data: { status } });
}

export async function deleteMagnet(id: string) {
  await prisma.leadMagnet.delete({ where: { id } });
  return { ok: true as const };
}

/** Recent submissions for a magnet's detail page. */
export function magnetSubmissions(magnetId: string, take = 100) {
  return prisma.leadMagnetSubmission.findMany({
    where: { magnetId },
    orderBy: { createdAt: "desc" },
    take,
    include: { lead: { select: { id: true, firstName: true, lastName: true, stage: true, trustScore: true } } },
  });
}

/** Content items that CTA to this magnet (the Content → magnet attribution view). */
export function linkedContent(magnetId: string) {
  return prisma.contentItem.findMany({
    where: { ctaMagnetId: magnetId },
    select: { id: true, title: true, channel: true, status: true, publishedUrl: true },
    orderBy: { updatedAt: "desc" },
  });
}
