"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendMailAsUser, fetchInboundFrom, graphConfigured } from "@/lib/graph";
import type { ActivityType, Stage } from "@prisma/client";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const leadSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  companyName: z.string().optional(),
  leadSource: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
  revenueEstimate: z.coerce.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
  headcountEstimate: z.coerce.number().int().nonnegative().optional().or(z.nan().transform(() => undefined)),
});

/** Empty string / NaN → null so blank estimate fields clear rather than error. */
function estimates(d: { revenueEstimate?: number; headcountEstimate?: number }) {
  return {
    revenueEstimate: d.revenueEstimate == null || Number.isNaN(d.revenueEstimate) ? null : d.revenueEstimate,
    headcountEstimate: d.headcountEstimate == null || Number.isNaN(d.headcountEstimate) ? null : d.headcountEstimate,
  };
}

export async function createLead(input: unknown) {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await currentUserId();
  const { revenueEstimate, headcountEstimate, ...rest } = parsed.data;
  const lead = await prisma.lead.create({
    data: {
      ...rest,
      email: parsed.data.email || null,
      ...estimates({ revenueEstimate, headcountEstimate }),
      ownerId: userId,
    },
  });
  revalidatePath("/leads");
  return { ok: true, id: lead.id };
}

export async function updateLead(id: string, input: unknown) {
  const parsed = leadSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { revenueEstimate, headcountEstimate, ...rest } = parsed.data;
  await prisma.lead.update({
    where: { id },
    data: { ...rest, email: parsed.data.email || null, ...estimates({ revenueEstimate, headcountEstimate }) },
  });
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadStage(id: string, stage: Stage) {
  await prisma.lead.update({ where: { id }, data: { stage } });
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  return { ok: true };
}

const activitySchema = z.object({
  leadId: z.string(),
  type: z.enum(["CALL", "TEXT", "NOTE", "MEETING", "OTHER"]),
  direction: z.enum(["IN", "OUT"]).default("OUT"),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function logActivity(input: unknown) {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const userId = await currentUserId();
  await prisma.activity.create({
    data: {
      leadId: parsed.data.leadId,
      userId,
      type: parsed.data.type as ActivityType,
      direction: parsed.data.direction,
      subject: parsed.data.subject || null,
      body: parsed.data.body || null,
    },
  });
  revalidatePath(`/leads/${parsed.data.leadId}`);
  return { ok: true };
}

const emailSchema = z.object({
  leadId: z.string(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function sendLeadEmail(input: unknown) {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid email fields" };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };

  const html = parsed.data.body.replace(/\n/g, "<br/>");
  let sendResult: { ok: boolean; error?: string } = { ok: true };

  if (graphConfigured()) {
    sendResult = await sendMailAsUser({
      userId,
      to: parsed.data.to,
      subject: parsed.data.subject,
      html,
    });
  } else {
    // Offline mode: record the email as logged even though Graph isn't wired.
    sendResult = { ok: true };
  }

  if (!sendResult.ok) return { ok: false, error: sendResult.error };

  await prisma.activity.create({
    data: {
      leadId: parsed.data.leadId,
      userId,
      type: "EMAIL_SENT",
      direction: "OUT",
      subject: parsed.data.subject,
      body: parsed.data.body,
      metadata: { channel: graphConfigured() ? "graph" : "offline-log" },
    },
  });
  revalidatePath(`/leads/${parsed.data.leadId}`);
  return { ok: true, offline: !graphConfigured() };
}

/** Pull recent inbound replies from this lead's email address into the timeline. */
export async function syncLeadInbound(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };
  if (!graphConfigured()) {
    return { ok: false, error: "Microsoft 365 is not connected." };
  }
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.email) return { ok: false, error: "Lead has no email address." };

  const messages = await fetchInboundFrom(userId, lead.email);
  let created = 0;
  for (const msg of messages) {
    const existing = await prisma.activity.findFirst({
      where: {
        leadId,
        type: "EMAIL_RECEIVED",
        metadata: { path: ["graphMessageId"], equals: msg.id },
      },
    });
    if (existing) continue;
    await prisma.activity.create({
      data: {
        leadId,
        userId,
        type: "EMAIL_RECEIVED",
        direction: "IN",
        subject: msg.subject || "(no subject)",
        body: msg.bodyPreview || "",
        occurredAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
        metadata: { graphMessageId: msg.id },
      },
    });
    created += 1;
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, created };
}

// ── Marketing → Sales: trust signals ────────────────────────────────────────────

const trustSignalSchema = z.object({
  leadId: z.string().min(1),
  kind: z.enum([
    "CONTENT_VIEW",
    "CONTENT_ENGAGE",
    "EMAIL_REPLY",
    "MEETING_ATTENDED",
    "WEBINAR",
    "DOWNLOAD",
    "REFERRAL",
    "INBOUND_INQUIRY",
    "MANUAL",
  ]),
  weight: z.coerce.number().int().optional(),
  note: z.string().optional(),
});

/** Record a trust signal on a lead (human-visible surface over Marketing handoff). */
export async function addLeadTrustSignal(input: unknown) {
  const parsed = trustSignalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { addTrustSignal } = await import("@/lib/trust");
  const { score } = await addTrustSignal({
    leadId: parsed.data.leadId,
    kind: parsed.data.kind,
    weight: parsed.data.weight ?? null,
    note: parsed.data.note || null,
    source: "manual",
  });
  revalidatePath(`/leads/${parsed.data.leadId}`);
  revalidatePath("/leads");
  return { ok: true as const, score };
}
