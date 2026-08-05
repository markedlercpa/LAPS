"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { markProposalWon, applyProposalTemplate, sendProposalCore } from "@/lib/proposals";
import { saveScope } from "@/lib/scoping";
import type { ProposalStatus } from "@prisma/client";

async function currentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const createSchema = z.object({
  leadId: z.string().min(1, "Select a lead"),
  title: z.string().min(1, "Title is required"),
});

export async function createProposal(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await currentUserId();
  const proposal = await prisma.proposal.create({
    data: {
      leadId: parsed.data.leadId,
      ownerId: userId,
      title: parsed.data.title,
    },
  });
  await prisma.lead.updateMany({
    where: { id: parsed.data.leadId, stage: { in: ["NEW", "APPOINTMENT"] } },
    data: { stage: "PROPOSAL" },
  });
  revalidatePath("/proposals");
  return { ok: true, id: proposal.id };
}

const metaSchema = z.object({
  title: z.string().min(1).optional(),
  estimatedDeliveryCost: z.coerce.number().min(0).optional(),
});

export async function updateProposalMeta(id: string, input: unknown) {
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await prisma.proposal.update({ where: { id }, data: parsed.data });
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return { ok: true };
}

const lineItemSchema = z.object({
  proposalId: z.string(),
  description: z.string().min(1, "Description required"),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().min(0).default(0),
});

export async function addLineItem(input: unknown) {
  const parsed = lineItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const count = await prisma.proposalLineItem.count({
    where: { proposalId: parsed.data.proposalId },
  });
  await prisma.proposalLineItem.create({
    data: { ...parsed.data, sortOrder: count },
  });
  revalidatePath(`/proposals/${parsed.data.proposalId}`);
  return { ok: true };
}

export async function deleteLineItem(id: string, proposalId: string) {
  await prisma.proposalLineItem.delete({ where: { id } });
  revalidatePath(`/proposals/${proposalId}`);
  return { ok: true };
}

const contentSchema = z.object({
  coverLetter: z.string().optional(),
  scopeNarrative: z.string().optional(),
  termsText: z.string().optional(),
});

/** Update the client-facing document sections. */
export async function updateProposalContent(id: string, input: unknown) {
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await prisma.proposal.update({ where: { id }, data: parsed.data });
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

const paymentMetaSchema = z.object({
  paymentScheduleType: z
    .enum(["ONE_TIME", "DEPOSIT_THEN_BALANCE", "INSTALLMENTS", "RECURRING"])
    .optional(),
  recurringInterval: z.string().optional(),
});

export async function updatePaymentMeta(id: string, input: unknown) {
  const parsed = paymentMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await prisma.proposal.update({ where: { id }, data: parsed.data });
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

const paymentSchema = z.object({
  proposalId: z.string(),
  description: z.string().min(1, "Description required"),
  amount: z.coerce.number().min(0).default(0),
  dueOn: z.string().optional(),
});

export async function addPayment(input: unknown) {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const count = await prisma.proposalPayment.count({
    where: { proposalId: parsed.data.proposalId },
  });
  await prisma.proposalPayment.create({ data: { ...parsed.data, sortOrder: count } });
  revalidatePath(`/proposals/${parsed.data.proposalId}`);
  return { ok: true };
}

export async function deletePayment(id: string, proposalId: string) {
  await prisma.proposalPayment.delete({ where: { id } });
  revalidatePath(`/proposals/${proposalId}`);
  return { ok: true };
}

const scopeSchema = z.object({
  markupEnabled: z.boolean(),
  markupPct: z.coerce.number().min(0),
  lines: z.array(
    z.object({
      level: z.enum(["ASSOCIATE", "SENIOR", "MANAGER", "DIRECTOR", "PARTNER"]),
      hours: z.coerce.number().min(0),
      costRate: z.coerce.number().min(0).optional(),
      billRate: z.coerce.number().min(0).optional(),
    }),
  ),
});

/** Save the scoping card; sets delivery cost (= budget cost) and the quoted fee. */
export async function updateScoping(proposalId: string, input: unknown) {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid scope" };
  }
  await saveScope(proposalId, parsed.data);
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true as const };
}

/** Attach (or change) the sample deliverable shown to the client. */
export async function updateDemo(proposalId: string, demoKey: string) {
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { demoKey: demoKey || null },
  });
  revalidatePath(`/proposals/${proposalId}`);
  return { ok: true as const };
}

/** Prefill this proposal from a full template (replaces sections + line items + schedule). */
export async function applyTemplate(id: string, templateKey: string) {
  const res = await applyProposalTemplate(id, templateKey);
  if (!res.ok) return res;
  revalidatePath(`/proposals/${id}`);
  return { ok: true as const };
}

/**
 * Send the proposal to the prospect (generate the public link, mark SENT, email
 * the client via Graph as the signed-in rep). Delegates to the shared core so
 * the agent API can send the same way.
 */
export async function sendProposal(id: string) {
  const userId = await currentUserId();
  const res = await sendProposalCore(id, userId);
  if (!res.ok) return res;
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  revalidatePath("/pipeline");
  return res;
}

/** Status transitions with pipeline side effects. */
export async function setProposalStatus(id: string, status: ProposalStatus) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { lineItems: true, handoff: true },
  });
  if (!proposal) return { ok: false, error: "Proposal not found" };

  if (status === "WON") {
    // Guardrails: need line items and a delivery budget so margin is meaningful.
    if (proposal.lineItems.length === 0) {
      return { ok: false, error: "Add at least one line item before winning." };
    }
    if (Number(proposal.estimatedDeliveryCost) <= 0) {
      return {
        ok: false,
        error: "Enter the estimated delivery cost (margin) before winning.",
      };
    }
    const res = await markProposalWon(id);
    if (!res.ok) return res;
    revalidatePath(`/proposals/${id}`);
    revalidatePath("/proposals");
    revalidatePath("/sales");
    return { ok: true };
  }

  const now = new Date();
  await prisma.proposal.update({
    where: { id },
    data: {
      status,
      sentAt: status === "SENT" && !proposal.sentAt ? now : proposal.sentAt,
      signedAt: status === "SIGNED" && !proposal.signedAt ? now : proposal.signedAt,
      lostAt: status === "LOST" ? now : proposal.lostAt,
    },
  });

  if (status === "LOST") {
    await prisma.lead.update({
      where: { id: proposal.leadId },
      data: { stage: "CLOSED_LOST" },
    });
  }

  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  revalidatePath("/sales");
  return { ok: true };
}
