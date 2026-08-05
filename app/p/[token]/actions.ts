"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { markProposalWon } from "@/lib/proposals";

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

/** Client clicks to sign: capture the signature + audit trail and win the deal. */
export async function signProposal(token: string, input: unknown) {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true },
  });
  if (!proposal) return { ok: false, error: "Not found" };
  if (proposal.status === "LOST") {
    return { ok: false, error: "This proposal is no longer available to sign." };
  }

  const { ip, userAgent } = await clientMeta();
  const res = await markProposalWon(proposal.id, {
    name: parsed.data.signerName,
    email: parsed.data.signerEmail || null,
    ip,
    userAgent,
  });
  if (!res.ok) return res;

  revalidatePath(`/p/${token}`);
  revalidatePath(`/proposals/${proposal.id}`);
  revalidatePath("/proposals");
  revalidatePath("/sales");
  revalidatePath("/pipeline");
  return { ok: true };
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
