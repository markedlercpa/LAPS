"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StapleStage } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  createEngagementManual,
  acceptStaging,
  advanceStage,
} from "@/lib/staple/engagements";
import { addInfoItem, markReceived } from "@/lib/staple/registry";
import { SERVICE_LINES } from "@/lib/staple-taxonomy";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const newEngagementSchema = z.object({
  legalName: z.string().min(1, "Client name is required"),
  serviceLine: z.enum(SERVICE_LINES),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  fee: z.coerce.number().min(0).optional(),
  scopeNarrative: z.string().optional(),
});

export async function createEngagement(input: unknown) {
  const parsed = newEngagementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await currentUserId();
  const { engagementId } = await createEngagementManual({
    legalName: parsed.data.legalName,
    serviceLine: parsed.data.serviceLine,
    ownerId: userId,
    contactName: parsed.data.contactName || null,
    contactEmail: parsed.data.contactEmail || null,
    fee: parsed.data.fee ?? null,
    scopeNarrative: parsed.data.scopeNarrative || null,
  });
  revalidatePath("/staple/engagements");
  return { ok: true as const, id: engagementId };
}

export async function acceptEngagement(id: string) {
  const userId = await currentUserId();
  await acceptStaging(id, userId);
  revalidatePath(`/staple/engagements/${id}`);
  return { ok: true as const };
}

export async function advanceEngagement(id: string, to: StapleStage) {
  const userId = await currentUserId();
  const res = await advanceStage(id, to, userId);
  revalidatePath(`/staple/engagements/${id}`);
  revalidatePath("/staple/engagements");
  return res;
}

const infoSchema = z.object({
  engagementId: z.string().min(1),
  clientId: z.string().min(1),
  label: z.string().min(1, "Label is required"),
  ownerSide: z.enum(["US", "CLIENT", "THIRD_PARTY"]).default("CLIENT"),
  status: z.enum(["RECEIVED", "REQUESTED", "PROMISED", "NOT_APPLICABLE"]).default("REQUESTED"),
});

export async function addInfo(input: unknown) {
  const parsed = infoSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  await addInfoItem({
    clientId: parsed.data.clientId,
    engagementId: parsed.data.engagementId,
    label: parsed.data.label,
    ownerSide: parsed.data.ownerSide,
    status: parsed.data.status,
    source: "MANUAL",
  });
  revalidatePath(`/staple/engagements/${parsed.data.engagementId}`);
  return { ok: true as const };
}

export async function markInfoReceived(id: string, engagementId: string) {
  await markReceived(id);
  revalidatePath(`/staple/engagements/${engagementId}`);
  return { ok: true as const };
}
