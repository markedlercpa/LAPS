"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { markProposalWon, finalizeDepositPaid } from "@/lib/proposals";
import { stripeConfigured, getStripe } from "@/lib/stripe";

/**
 * Public (unauthenticated) proposal actions. The opaque `publicToken` in the URL
 * is the capability — there is no session here. Each action re-resolves the
 * proposal by token and never trusts a client-supplied proposal id.
 */

async function clientMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent") || null;
  return { ip, userAgent };
}

function appBaseUrl() {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function finalizeRevalidate(token: string, proposalId: string) {
  revalidatePath(`/p/${token}`);
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  revalidatePath("/sales");
  revalidatePath("/pipeline");
}

/** Record that the client opened the proposal; bump SENT -> VIEWED once. */
export async function recordProposalView(token: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true, viewedAt: true },
  });
  if (!proposal) return { ok: false, error: "Not found" };

  if (!proposal.viewedAt || proposal.status === "SENT") {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        viewedAt: proposal.viewedAt ?? new Date(),
        status: proposal.status === "SENT" ? "VIEWED" : proposal.status,
      },
    });
    revalidatePath(`/proposals/${proposal.id}`);
  }
  return { ok: true };
}

const signSchema = z.object({
  signerName: z.string().min(2, "Please type your full name"),
  signerEmail: z.string().email().optional().or(z.literal("")),
});

/**
 * Client clicks to sign. Captures the signature/audit trail, then:
 *  - if a deposit is due and Stripe is configured, creates a Checkout Session and
 *    returns its URL — the deal is only finalized once payment completes; or
 *  - otherwise (no deposit / Stripe off) finalizes immediately (sign-only).
 */
export async function signProposal(token: string, input: unknown) {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      payments: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { amount: true, description: true },
      },
      lead: { select: { email: true } },
    },
  });
  if (!proposal) return { ok: false, error: "Not found" };
  if (proposal.status === "LOST") {
    return { ok: false, error: "This proposal is no longer available to sign." };
  }
  if (proposal.status === "WON") return { ok: true };

  const { ip, userAgent } = await clientMeta();
  const signerEmail = parsed.data.signerEmail || null;

  // Hold the pending signature on the proposal (finalized on payment / immediately).
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      signerName: parsed.data.signerName,
      signerEmail,
      signedIp: ip,
      signedUserAgent: userAgent,
    },
  });

  const deposit = Number(proposal.payments[0]?.amount ?? 0);

  if (stripeConfigured() && deposit > 0) {
    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Payments are temporarily unavailable." };
    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(deposit * 100),
            product_data: {
              name: `${proposal.title} — ${proposal.payments[0]?.description ?? "Deposit"}`,
            },
          },
        },
      ],
      customer_email: signerEmail || proposal.lead.email || undefined,
      metadata: { proposalId: proposal.id, token },
      success_url: `${base}/p/${token}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/p/${token}?canceled=1`,
    });
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { stripeSessionId: session.id, paymentStatus: "PENDING" },
    });
    revalidatePath(`/proposals/${proposal.id}`);
    return { ok: true, redirectUrl: session.url ?? undefined };
  }

  // No deposit due / Stripe not configured → finalize now.
  const res = await markProposalWon(proposal.id, {
    name: parsed.data.signerName,
    email: signerEmail,
    ip,
    userAgent,
  });
  if (!res.ok) return res;

  finalizeRevalidate(token, proposal.id);
  return { ok: true };
}

/** Confirm the deposit payment on return from Stripe Checkout (idempotent). */
export async function confirmPayment(token: string, sessionId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: { id: true, stripeSessionId: true },
  });
  if (!proposal) return { ok: false, error: "Not found" };
  // Only confirm the session we created for this proposal.
  if (proposal.stripeSessionId && proposal.stripeSessionId !== sessionId) {
    return { ok: false, error: "Session mismatch" };
  }

  const res = await finalizeDepositPaid(sessionId);
  if (res.ok) finalizeRevalidate(token, proposal.id);
  return res;
}

const declineSchema = z.object({
  reason: z.string().optional(),
});

/** Client declines the proposal. */
export async function declineProposal(token: string, input: unknown) {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: { id: true, leadId: true, status: true },
  });
  if (!proposal) return { ok: false, error: "Not found" };
  if (proposal.status === "WON") {
    return { ok: false, error: "This proposal has already been signed." };
  }

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      status: "LOST",
      lostAt: new Date(),
      lostReason: parsed.data.reason || "Declined by client",
    },
  });
  await prisma.lead.update({
    where: { id: proposal.leadId },
    data: { stage: "CLOSED_LOST" },
  });

  revalidatePath(`/p/${token}`);
  revalidatePath(`/proposals/${proposal.id}`);
  revalidatePath("/proposals");
  revalidatePath("/sales");
  revalidatePath("/pipeline");
  return { ok: true };
}
