import { revalidatePath } from "next/cache";
import { requireAgent, json, defaultOwnerId } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import {
  applyProposalTemplate,
  applyProposalFields,
  getProposalSummary,
} from "@/lib/proposals";
import { createProposalSchema } from "@/lib/agent-schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/proposals — create a proposal for an existing lead, optionally
 * prefilled from a template and/or with explicit field overrides.
 * Body: { leadId | leadEmail, templateKey?, title?, coverLetter?, scopeNarrative?,
 *         termsText?, estimatedDeliveryCost?, paymentScheduleType?, recurringInterval?,
 *         lineItems?[], payments?[] }
 */
export async function POST(req: Request) {
  const err = requireAgent(req);
  if (err) return err;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = createProposalSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid input", issues: parsed.error.issues }, 400);
  }
  const { leadId, leadEmail, templateKey, ...fields } = parsed.data;

  const lead = leadId
    ? await prisma.lead.findUnique({ where: { id: leadId } })
    : leadEmail
      ? await prisma.lead.findFirst({ where: { email: leadEmail } })
      : null;
  if (!lead) {
    return json(
      { error: "Lead not found. Provide leadId or leadEmail of an existing lead." },
      404,
    );
  }

  const ownerId = lead.ownerId ?? (await defaultOwnerId());
  const proposal = await prisma.proposal.create({
    data: { leadId: lead.id, ownerId, title: fields.title ?? "Proposal" },
  });

  if (templateKey) {
    const r = await applyProposalTemplate(proposal.id, templateKey);
    if (!r.ok) return json({ error: r.error }, 400);
  }
  await applyProposalFields(proposal.id, fields);

  // Advance the lead into the Proposal stage if it's earlier.
  await prisma.lead.updateMany({
    where: { id: lead.id, stage: { in: ["NEW", "APPOINTMENT"] } },
    data: { stage: "PROPOSAL" },
  });

  revalidatePath("/proposals");
  revalidatePath("/pipeline");
  const summary = await getProposalSummary(proposal.id);
  return json(summary, 201);
}
