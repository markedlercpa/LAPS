"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";
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

/** Status transitions with pipeline side effects. */
export async function setProposalStatus(id: string, status: ProposalStatus) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { lineItems: true, handoff: true },
  });
  if (!proposal) return { ok: false, error: "Proposal not found" };

  // Guardrails before marking WON: need line items and a delivery budget so the
  // estimated margin is meaningful.
  if (status === "WON") {
    if (proposal.lineItems.length === 0) {
      return { ok: false, error: "Add at least one line item before winning." };
    }
    if (Number(proposal.estimatedDeliveryCost) <= 0) {
      return {
        ok: false,
        error: "Enter the estimated delivery cost (margin) before winning.",
      };
    }
  }

  const now = new Date();
  await prisma.proposal.update({
    where: { id },
    data: {
      status,
      sentAt: status === "SENT" && !proposal.sentAt ? now : proposal.sentAt,
      signedAt: status === "SIGNED" && !proposal.signedAt ? now : proposal.signedAt,
      wonAt: status === "WON" ? now : proposal.wonAt,
      lostAt: status === "LOST" ? now : proposal.lostAt,
    },
  });

  if (status === "WON") {
    await prisma.lead.update({
      where: { id: proposal.leadId },
      data: { stage: "CLOSED_WON" },
    });
    if (!proposal.handoff) {
      await prisma.handoff.create({
        data: {
          proposalId: id,
          checklist: {
            create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({
              label,
              sortOrder: idx,
            })),
          },
        },
      });
    }
  } else if (status === "LOST") {
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
