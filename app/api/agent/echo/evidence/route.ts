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

const recordSchema = z.object({
  type: z.enum([
    "PAIN_POINT",
    "OBJECTION",
    "MYTH",
    "PRIZE_STATE",
    "CLIENT_STORY",
    "METHODOLOGY",
    "QUOTE",
    "DATA_POINT",
  ]),
  source: z
    .enum(["SALES_CALL", "CLIENT_ENGAGEMENT", "FIREFLIES_TRANSCRIPT", "EMAIL", "MANUAL"])
    .default("MANUAL"),
  sourceRef: z.string().optional(),
  rawText: z.string().min(1),
  distilled: z.string().optional(),
  clientRef: z.string().optional(),
  consent: z.enum(["INTERNAL_ONLY", "ANONYMIZED", "PUBLIC"]).default("INTERNAL_ONLY"),
  pillarTags: z.array(pillar).default([]),
  icpFit: z.boolean().default(false),
  icpNotes: z.string().optional(),
  strength: z.coerce.number().min(1).max(5).default(3),
});

const postSchema = z.object({ records: z.array(recordSchema).min(1).max(100) });

/** GET /api/agent/echo/evidence — recent evidence records (agent visibility). */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const records = await prisma.evidenceRecord.findMany({
    orderBy: [{ strength: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return json({ count: records.length, records });
}

/**
 * POST /api/agent/echo/evidence — bulk-create distilled evidence records. The
 * agent reads a transcript (via /transcripts) and posts the pains/objections/
 * myths/prize-states it distilled. Published-facing text (distilled) is scanned
 * for banned language and rejected if it hits.
 */
export async function POST(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  // Guardrail: banned language can't enter via distilled/raw text either.
  for (const r of parsed.data.records) {
    const banned = await findBannedPhrases([r.distilled, r.rawText].filter(Boolean).join(" "));
    if (banned.length) {
      return json(
        { error: `Contains retired/banned language: "${banned.join('", "')}"`, rawText: r.rawText },
        422,
      );
    }
  }

  const created = await prisma.$transaction(
    parsed.data.records.map((r) =>
      prisma.evidenceRecord.create({
        data: {
          type: r.type,
          source: r.source,
          sourceRef: r.sourceRef || null,
          rawText: r.rawText,
          distilled: r.distilled || null,
          clientRef: r.clientRef || null,
          consent: r.consent,
          pillarTags: r.pillarTags,
          icpFit: r.icpFit,
          icpNotes: r.icpNotes || null,
          strength: r.strength,
        },
      }),
    ),
  );

  return json({ created: created.length, ids: created.map((c) => c.id) });
}
