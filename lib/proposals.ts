import { prisma } from "@/lib/prisma";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";
import { getStripe } from "@/lib/stripe";

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

/**
 * Confirm a paid Stripe Checkout Session and finalize the proposal: stamp the
 * payment, complete the signature, and run the WON cascade. Idempotent — safe
 * for both the success-return confirmation and the webhook to call. Resolves the
 * proposal from the session's metadata (or its stored session id).
 */
export async function finalizeDepositPaid(sessionId: string) {
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, error: "Stripe not configured" };

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return { ok: false as const, error: "Payment not completed" };
  }

  const proposalId = session.metadata?.proposalId;
  const proposal = proposalId
    ? await prisma.proposal.findUnique({ where: { id: proposalId } })
    : await prisma.proposal.findUnique({ where: { stripeSessionId: sessionId } });
  if (!proposal) return { ok: false as const, error: "Proposal not found" };

  const now = new Date();
  const amountPaid =
    session.amount_total != null ? session.amount_total / 100 : undefined;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      paymentStatus: "PAID",
      amountPaid: amountPaid ?? proposal.amountPaid ?? undefined,
      paidAt: proposal.paidAt ?? now,
      stripePaymentIntentId: paymentIntentId ?? proposal.stripePaymentIntentId,
      signedAt: proposal.signedAt ?? now,
    },
  });

  // Signer fields were captured when the client clicked to sign; the WON cascade
  // (lead -> CLOSED_WON + onboarding handoff) is idempotent.
  await markProposalWon(proposal.id);
  return { ok: true as const };
}
