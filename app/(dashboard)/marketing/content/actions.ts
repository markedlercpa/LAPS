"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findBannedPhrases } from "@/lib/echo";

const pillar = z.enum([
  "EARNINGS",
  "CASH_FLOW",
  "REPORTING",
  "GROWTH",
  "TAXATION",
  "CAPITAL",
  "LIFESTYLE",
  "VALUATION",
]);

const channel = z.enum([
  "LINKEDIN",
  "X",
  "EMAIL",
  "NEWSLETTER",
  "BLOG",
  "YOUTUBE",
  "PODCAST",
  "WEBSITE",
  "BOOK",
  "OTHER",
]);

const status = z.enum(["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);

/** Reject any published-facing text that carries retired/banned language. */
async function guardBanned(...parts: (string | null | undefined)[]) {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  const banned = await findBannedPhrases(text);
  if (banned.length) {
    return `Contains retired/banned language: "${banned.join('", "')}"`;
  }
  return null;
}

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  channel: channel.default("LINKEDIN"),
  moduleId: z.string().optional(),
});

export async function createContentItem(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const banned = await guardBanned(parsed.data.title);
  if (banned) return { ok: false as const, error: banned };

  const item = await prisma.contentItem.create({
    data: {
      title: parsed.data.title,
      channel: parsed.data.channel,
      moduleId: parsed.data.moduleId || null,
    },
  });
  revalidatePath("/marketing/content");
  return { ok: true as const, id: item.id };
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  channel: channel.optional(),
  status: status.optional(),
  format: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  body: z.string().optional(),
  pillarTags: z.array(pillar).optional(),
  moduleId: z.string().nullable().optional(),
  publishedUrl: z.string().nullable().optional(),
});

export async function updateContentItem(input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...rest } = parsed.data;
  const banned = await guardBanned(rest.title, rest.summary, rest.body);
  if (banned) return { ok: false as const, error: banned };

  const data: Record<string, unknown> = {};
  if (rest.title !== undefined) data.title = rest.title;
  if (rest.channel !== undefined) data.channel = rest.channel;
  if (rest.status !== undefined) {
    data.status = rest.status;
    if (rest.status === "PUBLISHED") {
      const cur = await prisma.contentItem.findUnique({
        where: { id },
        select: { publishedAt: true },
      });
      if (cur && !cur.publishedAt) data.publishedAt = new Date();
    }
  }
  if (rest.format !== undefined) data.format = rest.format;
  if (rest.summary !== undefined) data.summary = rest.summary;
  if (rest.body !== undefined) data.body = rest.body;
  if (rest.pillarTags !== undefined) data.pillarTags = rest.pillarTags;
  if (rest.moduleId !== undefined) data.moduleId = rest.moduleId || null;
  if (rest.publishedUrl !== undefined) data.publishedUrl = rest.publishedUrl;

  await prisma.contentItem.update({ where: { id }, data });
  revalidatePath(`/marketing/content/${id}`);
  revalidatePath("/marketing/content");
  return { ok: true as const };
}

export async function setContentStatus(
  id: string,
  next: "DRAFT" | "REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED",
) {
  return updateContentItem({ id, status: next });
}

/** Attach or detach an evidence record (traceability). */
export async function toggleEvidenceLink(itemId: string, evidenceId: string, on: boolean) {
  await prisma.contentItem.update({
    where: { id: itemId },
    data: { evidence: on ? { connect: { id: evidenceId } } : { disconnect: { id: evidenceId } } },
  });
  revalidatePath(`/marketing/content/${itemId}`);
  return { ok: true as const };
}

/** Attach or detach a calling card. */
export async function toggleCardLink(itemId: string, cardId: string, on: boolean) {
  await prisma.contentItem.update({
    where: { id: itemId },
    data: { cards: on ? { connect: { id: cardId } } : { disconnect: { id: cardId } } },
  });
  revalidatePath(`/marketing/content/${itemId}`);
  return { ok: true as const };
}

/**
 * Repurpose an item to another channel: create a derived DRAFT that carries the
 * source's pillar tags + evidence + card links, so traceability survives. The
 * actual rewrite is left to a human/agent.
 */
export async function repurposeContentItem(sourceId: string, toChannel: unknown) {
  const ch = channel.safeParse(toChannel);
  if (!ch.success) return { ok: false as const, error: "Invalid channel" };

  const source = await prisma.contentItem.findUnique({
    where: { id: sourceId },
    include: { evidence: { select: { id: true } }, cards: { select: { id: true } } },
  });
  if (!source) return { ok: false as const, error: "Source not found" };

  const derived = await prisma.contentItem.create({
    data: {
      title: `${source.title} — ${ch.data}`,
      channel: ch.data,
      status: "DRAFT",
      summary: source.summary,
      pillarTags: source.pillarTags,
      sourceItemId: source.id,
      evidence: { connect: source.evidence.map((e) => ({ id: e.id })) },
      cards: { connect: source.cards.map((c) => ({ id: c.id })) },
    },
  });
  revalidatePath("/marketing/content");
  return { ok: true as const, id: derived.id };
}
