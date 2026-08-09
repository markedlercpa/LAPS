import { revalidatePath } from "next/cache";
import { requireAgent, json, defaultOwnerId } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { sendProposalCore } from "@/lib/proposals";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/proposals/:id/send — generate the public link, mark SENT, and
 * email the client (via the proposal owner's Microsoft account when connected).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAgent(req);
  if (err) return err;
  const { id } = await params;

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!proposal) return json({ error: "Proposal not found" }, 404);

  const actor = proposal.ownerId ?? (await defaultOwnerId());
  const res = await sendProposalCore(id, actor);
  if (!res.ok) return json({ error: res.error }, 400);

  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  revalidatePath("/pipeline");
  return json({ ok: true, link: res.link, emailed: res.emailed, emailError: res.emailError });
}
