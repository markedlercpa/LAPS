"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fetchCalendarEvents, graphConfigured } from "@/lib/graph";
import type { AppointmentStatus } from "@prisma/client";

async function currentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const apptSchema = z.object({
  leadId: z.string().min(1, "Select a lead"),
  title: z.string().min(1, "Title is required"),
  scheduledAt: z.string().min(1, "Pick a date/time"),
  durationMin: z.coerce.number().int().positive().default(30),
  notes: z.string().optional(),
});

export async function createAppointment(input: unknown) {
  const parsed = apptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await currentUserId();
  await prisma.appointment.create({
    data: {
      leadId: parsed.data.leadId,
      ownerId: userId,
      title: parsed.data.title,
      scheduledAt: new Date(parsed.data.scheduledAt),
      durationMin: parsed.data.durationMin,
      notes: parsed.data.notes || null,
    },
  });
  // Advance lead to APPOINTMENT stage if still NEW
  await prisma.lead.updateMany({
    where: { id: parsed.data.leadId, stage: "NEW" },
    data: { stage: "APPOINTMENT" },
  });
  revalidatePath("/appointments");
  return { ok: true };
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  await prisma.appointment.update({ where: { id }, data: { status } });
  revalidatePath("/appointments");
  return { ok: true };
}

const actionItemSchema = z.object({
  appointmentId: z.string(),
  leadId: z.string().optional(),
  description: z.string().min(1),
  dueDate: z.string().optional(),
});

export async function addActionItem(input: unknown) {
  const parsed = actionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const userId = await currentUserId();
  await prisma.actionItem.create({
    data: {
      appointmentId: parsed.data.appointmentId,
      leadId: parsed.data.leadId || null,
      assigneeId: userId,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });
  revalidatePath("/appointments");
  return { ok: true };
}

export async function toggleActionItem(id: string, done: boolean) {
  await prisma.actionItem.update({
    where: { id },
    data: { status: done ? "DONE" : "OPEN" },
  });
  revalidatePath("/appointments");
  return { ok: true };
}

/**
 * Sync appointments from the signed-in rep's M365 calendar for a +/- window.
 * Matches an event attendee to an existing lead by email; unmatched events are
 * skipped (an appointment must belong to a lead).
 */
export async function syncCalendar() {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };
  if (!graphConfigured()) return { ok: false, error: "Microsoft 365 is not connected." };

  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const end = new Date(now.getTime() + 60 * 86_400_000).toISOString();
  const events = await fetchCalendarEvents(userId, start, end);

  let created = 0;
  for (const ev of events) {
    if (!ev.start?.dateTime) continue;
    const attendeeEmails = (ev.attendees ?? [])
      .map((a) => a.emailAddress?.address?.toLowerCase())
      .filter(Boolean) as string[];
    if (attendeeEmails.length === 0) continue;

    const lead = await prisma.lead.findFirst({
      where: { email: { in: attendeeEmails, mode: "insensitive" } },
    });
    if (!lead) continue;

    const existing = ev.id
      ? await prisma.appointment.findUnique({ where: { graphEventId: ev.id } })
      : null;
    if (existing) continue;

    await prisma.appointment.create({
      data: {
        leadId: lead.id,
        ownerId: userId,
        title: ev.subject || "Call",
        scheduledAt: new Date(ev.start.dateTime),
        status: new Date(ev.start.dateTime) < now ? "COMPLETED" : "BOOKED",
        graphEventId: ev.id,
      },
    });
    created += 1;
  }
  revalidatePath("/appointments");
  return { ok: true, created };
}
