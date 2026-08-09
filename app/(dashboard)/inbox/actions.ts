"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  getMailMessage,
  replyToMail,
  moveMail,
  setMailCategories,
  setMailRead,
} from "@/lib/graph";
import { ensureHost } from "@/lib/booking";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || full || "Unknown", last: parts.slice(1).join(" ") };
}

/** Load one message's full body for the reading pane. */
export async function loadEmail(id: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const msg = await getMailMessage(userId, id);
  if (!msg) return { ok: false as const, error: "Microsoft 365 not connected or message not found." };
  // Opening marks it read (fire and forget, mirrors an inbox).
  if (!msg.isRead) void setMailRead(userId, id, true);
  return { ok: true as const, message: msg };
}

export async function replyEmail(id: string, html: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  if (!html.trim()) return { ok: false as const, error: "Reply is empty" };
  const res = await replyToMail(userId, id, html);
  revalidatePath("/inbox");
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
}

export async function archiveEmail(id: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const res = await moveMail(userId, id, "archive");
  revalidatePath("/inbox");
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
}

export async function markEmail(id: string, isRead: boolean) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  await setMailRead(userId, id, isRead);
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function tagEmail(id: string, categories: string[]) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const res = await setMailCategories(userId, id, categories);
  revalidatePath("/inbox");
  return res.ok ? { ok: true as const, categories } : { ok: false as const, error: res.error };
}

// ── Create Sales objects from an email ─────────────────────────────────────

const fromSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
});

/** Find a lead by sender email (case-insensitive). */
async function matchLead(email?: string) {
  if (!email) return null;
  return prisma.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

const taskSchema = z.object({
  description: z.string().min(1, "Describe the task"),
  dueDate: z.string().optional(),
  senderEmail: z.string().optional(),
});

/** Create an action item, tied to a matched lead when the sender is known. */
export async function createTaskFromEmail(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const lead = await matchLead(parsed.data.senderEmail);
  await prisma.actionItem.create({
    data: {
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assigneeId: userId,
      leadId: lead?.id ?? null,
    },
  });
  revalidatePath("/appointments");
  return { ok: true as const, leadMatched: Boolean(lead) };
}

const leadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Sender has no valid email"),
  companyName: z.string().optional(),
});

/** Create a lead from the sender (or return the existing match). */
export async function createLeadFromEmail(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };

  const existing = await matchLead(parsed.data.email);
  if (existing) return { ok: true as const, id: existing.id, existed: true };

  const { first, last } = splitName(parsed.data.name || parsed.data.email);
  const lead = await prisma.lead.create({
    data: {
      firstName: first,
      lastName: last,
      email: parsed.data.email,
      companyName: parsed.data.companyName || null,
      leadSource: "Email",
      ownerId: userId,
    },
  });
  revalidatePath("/leads");
  return { ok: true as const, id: lead.id, existed: false };
}

const logSchema = z.object({
  emailId: z.string().min(1),
  leadId: z.string().optional(),
  senderEmail: z.string().optional(),
});

/** File the email as an activity on a matched (or specified) lead's timeline. */
export async function logEmailToLead(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const lead = parsed.data.leadId
    ? await prisma.lead.findUnique({ where: { id: parsed.data.leadId } })
    : await matchLead(parsed.data.senderEmail);
  if (!lead) {
    return { ok: false as const, error: "No matching lead — create the lead first." };
  }

  const msg = await getMailMessage(userId, parsed.data.emailId);
  if (!msg) return { ok: false as const, error: "Couldn't load the email." };

  // Avoid duplicate logs of the same message.
  const dup = await prisma.activity.findFirst({
    where: { leadId: lead.id, type: "EMAIL_RECEIVED", metadata: { path: ["graphMessageId"], equals: msg.id } },
  });
  if (dup) return { ok: true as const, leadId: lead.id, already: true };

  await prisma.activity.create({
    data: {
      leadId: lead.id,
      userId,
      type: "EMAIL_RECEIVED",
      direction: "IN",
      subject: msg.subject,
      body: msg.bodyPreview,
      occurredAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
      metadata: { graphMessageId: msg.id },
    },
  });
  revalidatePath(`/leads/${lead.id}`);
  return { ok: true as const, leadId: lead.id, already: false };
}

/** Reply to the email with the host's booking link. */
export async function replyWithBookingLink(id: string, baseUrl: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const host = await ensureHost(userId);
  const url = `${baseUrl.replace(/\/$/, "")}/book/${host.slug}`;
  const html = `<p>Happy to connect — grab a time that works for you here:</p>
    <p><a href="${url}">${url}</a></p>`;
  const res = await replyToMail(userId, id, html);
  revalidatePath("/inbox");
  return res.ok ? { ok: true as const, url } : { ok: false as const, error: res.error };
}
