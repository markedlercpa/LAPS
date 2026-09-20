import { z } from "zod";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

const snapshotSchema = z.object({
  contentItemId: z.string().optional(),
  channel: channel.optional(),
  impressions: z.coerce.number().int().min(0).default(0),
  engagements: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  conversions: z.coerce.number().int().min(0).default(0),
  note: z.string().optional(),
  source: z.string().optional(),
});

const postSchema = z.object({ snapshots: z.array(snapshotSchema).min(1).max(200) });

/** GET /api/agent/echo/metrics — recent performance snapshots. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const snapshots = await prisma.metricSnapshot.findMany({
    orderBy: { capturedAt: "desc" },
    take: 300,
  });
  return json({ count: snapshots.length, snapshots });
}

/** POST /api/agent/echo/metrics — bulk-record manually aggregated snapshots. */
export async function POST(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  const created = await prisma.$transaction(
    parsed.data.snapshots.map((s) =>
      prisma.metricSnapshot.create({
        data: {
          contentItemId: s.contentItemId || null,
          channel: s.channel ?? null,
          impressions: s.impressions,
          engagements: s.engagements,
          clicks: s.clicks,
          conversions: s.conversions,
          note: s.note || null,
          source: s.source || null,
        },
      }),
    ),
  );
  return json({ created: created.length, ids: created.map((c) => c.id) });
}
