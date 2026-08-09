import type { StapleStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";
import { gateFor } from "@/lib/staple/gates";
import { seedRegistry } from "@/lib/staple/registry";

/**
 * STAPLE engagement lifecycle. The engagement is the delivery spine; it is
 * created either from a won LAPS proposal (adapter path) or via a manual intake
 * form (adapter-free path), and advances through stages behind explicit gates.
 */

/** Create an engagement from a manual intake form — works with zero adapters. */
export async function createEngagementManual(input: {
  legalName: string;
  serviceLine: string;
  ownerId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  fee?: number | null;
  scopeNarrative?: string | null;
  infoLabels?: string[]; // optional starting IRL
}) {
  const client = await prisma.stapleClient.create({
    data: {
      legalName: input.legalName,
      ownerId: input.ownerId ?? null,
      contacts:
        input.contactName || input.contactEmail
          ? { create: [{ name: input.contactName || input.contactEmail || "Primary contact", email: input.contactEmail ?? null }] }
          : undefined,
    },
  });

  const engagement = await prisma.engagement.create({
    data: {
      clientId: client.id,
      serviceLine: input.serviceLine,
      stage: "STAGING",
      ownerId: input.ownerId ?? null,
      handoffSummary: {
        sold: [],
        promised: [],
        know: [`Manual intake for ${input.legalName}`],
        have: [],
      },
      terms: {
        create: {
          version: 1,
          title: `${input.legalName} — engagement`,
          fee: input.fee ?? null,
          scopeNarrative: input.scopeNarrative ?? null,
        },
      },
    },
  });

  const labels = input.infoLabels?.length ? input.infoLabels : ONBOARDING_CHECKLIST_TEMPLATE;
  await seedRegistry(client.id, engagement.id, labels.map((label) => ({ label, source: "MANUAL" as const })));

  return { clientId: client.id, engagementId: engagement.id };
}

/**
 * Spawn a STAPLE engagement from a won proposal. Idempotent — a second call for
 * the same proposal returns the existing engagement without duplicating. Called
 * in-process from markProposalWon (the LAPS→STAPLE seam).
 */
export async function createEngagementFromWon(proposalId: string) {
  const existing = await prisma.engagement.findUnique({ where: { proposalId } });
  if (existing) return { engagementId: existing.id, clientId: existing.clientId, created: false };

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      lead: true,
      payments: { orderBy: { sortOrder: "asc" } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      handoff: true,
    },
  });
  if (!proposal) return { engagementId: null, clientId: null, created: false };

  const lead = proposal.lead;

  // Reuse a client already linked to this lead, else create one from the lead.
  let client = lead ? await prisma.stapleClient.findUnique({ where: { leadId: lead.id } }) : null;
  if (!client) {
    client = await prisma.stapleClient.create({
      data: {
        legalName: lead?.companyName || `${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim() || "New client",
        leadId: lead?.id ?? null,
        ownerId: proposal.ownerId ?? lead?.ownerId ?? null,
        contacts:
          lead && (lead.firstName || lead.email)
            ? {
                create: [
                  {
                    name: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.email || "Primary contact",
                    email: lead.email ?? null,
                    phone: lead.phone ?? null,
                    role: "owner",
                  },
                ],
              }
            : undefined,
      },
    });
  }

  const engagement = await prisma.engagement.create({
    data: {
      clientId: client.id,
      serviceLine: "advisory_other", // refined at Takeoff; proposal has no service-line enum
      stage: "STAGING",
      ownerId: proposal.ownerId ?? null,
      proposalId: proposal.id,
      handoffId: proposal.handoff?.id ?? null,
      leadId: lead?.id ?? null,
      handoffSummary: {
        sold: proposal.lineItems.map((li) => li.description),
        promised: proposal.scopeNarrative ? [proposal.scopeNarrative] : [],
        know: [`Won proposal "${proposal.title}"`],
        have: [],
      },
      terms: {
        create: {
          version: 1,
          title: proposal.title,
          fee: proposal.estimatedDeliveryCost ?? null,
          scopeNarrative: proposal.scopeNarrative ?? null,
          services: proposal.lineItems.map((li) => ({ name: li.description })),
          paymentSchedule: proposal.payments.map((p) => ({
            label: p.description,
            amount: Number(p.amount),
            dueOn: p.dueOn ?? null,
          })),
          sourceProposalId: proposal.id,
        },
      },
    },
  });

  await seedRegistry(
    client.id,
    engagement.id,
    ONBOARDING_CHECKLIST_TEMPLATE.map((label) => ({ label, source: "SALES_HANDOFF" as const })),
  );

  return { engagementId: engagement.id, clientId: client.id, created: true };
}

/** Delivery lead accepts the staging handoff (satisfies part of the gate). */
export async function acceptStaging(engagementId: string, userId: string | null) {
  return prisma.engagement.update({
    where: { id: engagementId },
    data: { accepted: true, acceptedById: userId, acceptedAt: new Date() },
  });
}

/** Advance a stage behind its gate. Returns blocked reasons on failure. */
export async function advanceStage(
  engagementId: string,
  to: StapleStage,
  userId: string | null,
): Promise<{ ok: boolean; reasons?: string[] }> {
  const engagement = await prisma.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) return { ok: false, reasons: ["Engagement not found."] };

  const gate = gateFor(engagement, to);
  if (!gate.ok) return { ok: false, reasons: gate.reasons };

  await prisma.$transaction([
    prisma.engagement.update({ where: { id: engagementId }, data: { stage: to } }),
    prisma.stageTransition.create({
      data: { engagementId, fromStage: engagement.stage, toStage: to, byUserId: userId },
    }),
  ]);
  return { ok: true };
}

/** Engagement counts grouped by stage (for the list header). */
export async function stageCounts(): Promise<Record<string, number>> {
  const grouped = await prisma.engagement.groupBy({ by: ["stage"], _count: { _all: true } });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.stage] = g._count._all;
  return out;
}
