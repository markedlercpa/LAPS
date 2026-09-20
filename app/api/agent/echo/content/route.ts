import { z } from "zod";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { findBannedPhrases } from "@/lib/echo";

export const dynamic = "force-dynamic";

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

async function bannedError(...parts: (string | null | undefined)[]) {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  const hits = await findBannedPhrases(text);
  return hits.length ? `Contains retired/banned language: "${hits.join('", "')}"` : null;
}

/** GET /api/agent/echo/content — recent content items with trace counts. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const item = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        evidence: { select: { id: true } },
        cards: { select: { id: true } },
      },
    });
    if (!item) return json({ error: "Not found" }, 404);
    return json({ item });
  }
  const items = await prisma.contentItem.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { evidence: true, cards: true } } },
  });
  return json({ count: items.length, items });
}

const createSchema = z.object({
  title: z.string().min(1),
  channel: channel.default("LINKEDIN"),
  status: status.default("DRAFT"),
  summary: z.string().optional(),
  body: z.string().default(""),
  pillarTags: z.array(pillar).default([]),
  evidenceIds: z.array(z.string()).default([]),
  cardIds: z.array(z.string()).default([]),
  publishedUrl: z.string().optional(),
});

/** POST /api/agent/echo/content — create a content item (agent-managed). */
export async function POST(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  const d = parsed.data;
  const banned = await bannedError(d.title, d.summary, d.body);
  if (banned) return json({ error: banned }, 422);

  const item = await prisma.contentItem.create({
    data: {
      title: d.title,
      channel: d.channel,
      status: d.status,
      summary: d.summary || null,
      body: d.body,
      pillarTags: d.pillarTags,
      publishedUrl: d.publishedUrl || null,
      publishedAt: d.status === "PUBLISHED" ? new Date() : null,
      evidence: { connect: d.evidenceIds.map((id) => ({ id })) },
      cards: { connect: d.cardIds.map((id) => ({ id })) },
    },
  });
  return json({ id: item.id });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  channel: channel.optional(),
  status: status.optional(),
  summary: z.string().nullable().optional(),
  body: z.string().optional(),
  pillarTags: z.array(pillar).optional(),
  evidenceIds: z.array(z.string()).optional(),
  cardIds: z.array(z.string()).optional(),
  publishedUrl: z.string().nullable().optional(),
});

/** PUT /api/agent/echo/content — update an item; set links replace existing. */
export async function PUT(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  const { id, evidenceIds, cardIds, ...rest } = parsed.data;
  const banned = await bannedError(rest.title, rest.summary ?? undefined, rest.body);
  if (banned) return json({ error: banned }, 422);

  const data: Record<string, unknown> = {};
  if (rest.title !== undefined) data.title = rest.title;
  if (rest.channel !== undefined) data.channel = rest.channel;
  if (rest.status !== undefined) data.status = rest.status;
  if (rest.summary !== undefined) data.summary = rest.summary;
  if (rest.body !== undefined) data.body = rest.body;
  if (rest.pillarTags !== undefined) data.pillarTags = rest.pillarTags;
  if (rest.publishedUrl !== undefined) data.publishedUrl = rest.publishedUrl;
  if (rest.status === "PUBLISHED") {
    const cur = await prisma.contentItem.findUnique({ where: { id }, select: { publishedAt: true } });
    if (cur && !cur.publishedAt) data.publishedAt = new Date();
  }
  if (evidenceIds) data.evidence = { set: evidenceIds.map((eid) => ({ id: eid })) };
  if (cardIds) data.cards = { set: cardIds.map((cid) => ({ id: cid })) };

  const item = await prisma.contentItem.update({ where: { id }, data });
  return json({ id: item.id });
}
