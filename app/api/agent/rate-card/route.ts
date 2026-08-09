import { z } from "zod";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { getRateCard } from "@/lib/rate-card";

export const dynamic = "force-dynamic";

/** GET /api/agent/rate-card — firm standard cost + billing rates by level. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  return json({ rates: await getRateCard() });
}

const putSchema = z.object({
  rates: z.array(
    z.object({
      level: z.enum(["ASSOCIATE", "SENIOR", "MANAGER", "DIRECTOR", "PARTNER"]),
      cost: z.number().min(0),
      bill: z.number().min(0),
    }),
  ),
});

/** PUT /api/agent/rate-card — set firm rates (upsert per provided level). */
export async function PUT(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  for (let i = 0; i < parsed.data.rates.length; i++) {
    const r = parsed.data.rates[i];
    await prisma.rateCardLevel.upsert({
      where: { level: r.level },
      update: { cost: r.cost, bill: r.bill },
      create: { level: r.level, cost: r.cost, bill: r.bill, sortOrder: i },
    });
  }
  return json({ rates: await getRateCard() });
}
