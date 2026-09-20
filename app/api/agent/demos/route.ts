import { z } from "zod";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { ensureDemosSeeded, listDemos } from "@/lib/demos";

export const dynamic = "force-dynamic";

/** GET /api/agent/demos — the sample-deliverable library. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  return json({ demos: await listDemos() });
}

const metricSchema = z.object({ label: z.string(), value: z.string(), hint: z.string().optional() });
const tableSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
const putSchema = z.object({
  key: z.string().min(1),
  serviceLine: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  metrics: z.array(metricSchema).optional(),
  tables: z.array(tableSchema).optional(),
  narrative: z.string().nullable().optional(),
  isPlaceholder: z.boolean().optional(),
});

/** PUT /api/agent/demos — upsert a demo by key (real content clears the sample flag). */
export async function PUT(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  await ensureDemosSeeded();
  const { key, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (rest.isPlaceholder === undefined) data.isPlaceholder = false;

  await prisma.demoTemplate.upsert({
    where: { key },
    update: data,
    create: {
      key,
      serviceLine: rest.serviceLine ?? "GENERAL",
      name: rest.name ?? key,
      title: rest.title ?? key,
      subtitle: rest.subtitle ?? null,
      metrics: rest.metrics ?? [],
      tables: rest.tables ?? [],
      narrative: rest.narrative ?? null,
      isPlaceholder: rest.isPlaceholder ?? false,
    },
  });
  return json({ demos: await listDemos() });
}
