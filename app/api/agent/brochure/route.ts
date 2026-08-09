import { z } from "zod";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { ensureBrochureSeeded, getBrochure } from "@/lib/brochure";

export const dynamic = "force-dynamic";

/** GET /api/agent/brochure — current firm brochure / social proof. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  return json(await getBrochure());
}

const statSchema = z.object({ value: z.string(), label: z.string() });
const caseStudySchema = z.object({
  service: z.string(),
  title: z.string(),
  result: z.string(),
  detail: z.string(),
});
const testimonialSchema = z.object({ quote: z.string(), author: z.string(), role: z.string() });
const linkedinSchema = z.object({ excerpt: z.string(), url: z.string() });

const putSchema = z.object({
  headline: z.string().optional(),
  intro: z.string().optional(),
  stats: z.array(statSchema).optional(),
  caseStudies: z.array(caseStudySchema).optional(),
  testimonials: z.array(testimonialSchema).optional(),
  linkedinPosts: z.array(linkedinSchema).optional(),
  isPlaceholder: z.boolean().optional(),
});

/**
 * PUT /api/agent/brochure — update any subset of the brochure. Providing content
 * marks it real (isPlaceholder=false) so the sample banner disappears, unless
 * isPlaceholder is set explicitly.
 */
export async function PUT(req: Request) {
  const err = requireAgent(req);
  if (err) return err;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  await ensureBrochureSeeded();
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.isPlaceholder === undefined) data.isPlaceholder = false;

  await prisma.brochure.update({ where: { id: "default" }, data });
  return json(await getBrochure());
}
