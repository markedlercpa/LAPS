import { prisma } from "@/lib/prisma";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";

export type Signer = {
  name?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Mark a proposal as Won and run the Sales-Closed cascade: move the lead to
 * CLOSED_WON and create the Handoff seeded with the onboarding checklist (once).
 * When `signer` is provided (client e-signature), stamp the signature audit
 * fields. Idempotent — safe to call again on an already-won proposal.
 *
 * Shared by the internal status control (proposals/actions.ts) and the public
 * e-sign flow (app/p/[token]/actions.ts).
 */
export async function markProposalWon(proposalId: string, signer?: Signer) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { handoff: true },
  });
  if (!proposal) return { ok: false as const, error: "Proposal not found" };

  const now = new Date();

  // Always capture signature details if this call carries them, even if the
  // proposal was already won by another path.
  const signerData = signer
    ? {
        signedAt: proposal.signedAt ?? now,
        signerName: signer.name ?? proposal.signerName,
        signerEmail: signer.email ?? proposal.signerEmail,
        signedIp: signer.ip ?? proposal.signedIp,
        signedUserAgent: signer.userAgent ?? proposal.signedUserAgent,
      }
    : {};

  if (proposal.status === "WON") {
    if (signer) {
      await prisma.proposal.update({ where: { id: proposalId }, data: signerData });
    }
    return { ok: true as const };
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "WON", wonAt: proposal.wonAt ?? now, ...signerData },
  });

  await prisma.lead.update({
    where: { id: proposal.leadId },
    data: { stage: "CLOSED_WON" },
  });

  if (!proposal.handoff) {
    await prisma.handoff.create({
      data: {
        proposalId,
        checklist: {
          create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({
            label,
            sortOrder: idx,
          })),
        },
      },
    });
  }

  return { ok: true as const };
}
