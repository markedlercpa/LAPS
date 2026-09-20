import type { InfoSource, OwnerSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Information Registry helpers — the "never ask twice" ledger. InfoItems are
 * client-scoped and engagement-linked, so a returning client's prior items
 * count as already-received across engagements.
 */

export async function addInfoItem(input: {
  clientId: string;
  engagementId?: string | null;
  label: string;
  canonicalKey?: string | null;
  status?: "RECEIVED" | "REQUESTED" | "PROMISED" | "NOT_APPLICABLE";
  source?: InfoSource;
  ownerSide?: OwnerSide;
  notes?: string | null;
}) {
  const status = input.status ?? "REQUESTED";
  return prisma.infoItem.create({
    data: {
      clientId: input.clientId,
      engagementId: input.engagementId ?? null,
      label: input.label,
      canonicalKey: input.canonicalKey ?? null,
      status,
      source: input.source ?? "MANUAL",
      ownerSide: input.ownerSide ?? "CLIENT",
      notes: input.notes ?? null,
      requestedAt: status === "REQUESTED" ? new Date() : null,
      receivedAt: status === "RECEIVED" ? new Date() : null,
    },
  });
}

/** Flip an InfoItem to received (optionally attaching a file). */
export async function markReceived(id: string, fileAssetId?: string | null) {
  return prisma.infoItem.update({
    where: { id },
    data: { status: "RECEIVED", receivedAt: new Date(), fileAssetId: fileAssetId ?? undefined },
  });
}

/**
 * Seed a registry from a list of labels (e.g. the onboarding checklist or a
 * canonical IRL). Idempotent per (engagement,label): skips labels already
 * present on the engagement.
 */
export async function seedRegistry(
  clientId: string,
  engagementId: string,
  items: { label: string; source?: InfoSource; ownerSide?: OwnerSide }[],
) {
  const existing = await prisma.infoItem.findMany({
    where: { engagementId },
    select: { label: true },
  });
  const seen = new Set(existing.map((e) => e.label.toLowerCase()));
  let created = 0;
  for (const it of items) {
    if (seen.has(it.label.toLowerCase())) continue;
    await prisma.infoItem.create({
      data: {
        clientId,
        engagementId,
        label: it.label,
        status: "REQUESTED",
        source: it.source ?? "SALES_HANDOFF",
        ownerSide: it.ownerSide ?? "CLIENT",
        requestedAt: new Date(),
      },
    });
    created += 1;
  }
  return created;
}
