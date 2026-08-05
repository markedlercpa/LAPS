import { revalidatePath } from "next/cache";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import {
  applyProposalTemplate,
  applyProposalFields,
  getProposalSummary,
} from "@/lib/proposals";
import { patchProposalSchema } from "@/lib/agent-schemas";

export const dynamic = "force-dynamic";

/** GET /api/agent/proposals/:id — full proposal payload. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAgent(req);
  if (err) return err;
  const { id } = await params;
  const summary = await getProposalSummary(id);
  if (!summary) return json({ error: "Proposal not found" }, 404);
  return json(summary);
}

/**
 * PATCH /api/agent/proposals/:id — apply a template and/or field overrides.
 * lineItems/payments arrays replace existing rows when present.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAgent(req);
  if (err) return err;
  const { id } = await params;

  const exists = await prisma.proposal.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return json({ error: "Proposal not found" }, 404);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = patchProposalSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid input", issues: parsed.error.issues }, 400);
  }
  const { templateKey, ...fields } = parsed.data;

  if (templateKey) {
    const r = await applyProposalTemplate(id, templateKey);
    if (!r.ok) return json({ error: r.error }, 400);
  }
  await applyProposalFields(id, fields);

  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  const summary = await getProposalSummary(id);
  return json(summary);
}
