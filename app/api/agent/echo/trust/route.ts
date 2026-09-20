import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { addTrustSignal } from "@/lib/trust";

export const dynamic = "force-dynamic";

const signalSchema = z
  .object({
    leadId: z.string().optional(),
    email: z.string().email().optional(),
    kind: z.enum([
      "CONTENT_VIEW",
      "CONTENT_ENGAGE",
      "EMAIL_REPLY",
      "MEETING_ATTENDED",
      "WEBINAR",
      "DOWNLOAD",
      "REFERRAL",
      "INBOUND_INQUIRY",
      "MANUAL",
    ]),
    weight: z.coerce.number().int().optional(),
    note: z.string().optional(),
    contentRef: z.string().optional(),
    source: z.string().optional(),
  })
  .refine((v) => v.leadId || v.email, { message: "leadId or email is required" });

/**
 * POST /api/agent/echo/trust — record a trust signal on a lead. The lead is
 * resolved by leadId or (case-insensitive) email so ECHO can push content
 * engagement without knowing internal IDs. Returns the new cached score.
 */
export async function POST(req: Request) {
  const err = requireAgent(req);
  if (err) return err;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);
  const parsed = signalSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);

  const d = parsed.data;
  const lead = d.leadId
    ? await prisma.lead.findUnique({ where: { id: d.leadId }, select: { id: true } })
    : await prisma.lead.findFirst({
        where: { email: { equals: d.email, mode: "insensitive" } },
        select: { id: true },
      });
  if (!lead) return json({ error: "Lead not found" }, 404);

  const { score, signalId } = await addTrustSignal({
    leadId: lead.id,
    kind: d.kind,
    weight: d.weight ?? null,
    note: d.note ?? null,
    contentRef: d.contentRef ?? null,
    source: d.source ?? "echo",
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  return json({ leadId: lead.id, signalId, trustScore: score });
}
