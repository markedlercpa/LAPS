"use server";

import { z } from "zod";
import { createBooking, rescheduleBooking, cancelBooking } from "@/lib/booking";

const submitSchema = z.object({
  eventTypeId: z.string().min(1),
  startISO: z.string().min(1),
  name: z.string().min(1, "Your name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().optional(),
  inviteeTimezone: z.string().min(1),
  answers: z.record(z.string(), z.string()).optional(),
});

export async function submitBooking(input: unknown) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  return createBooking(parsed.data);
}

export async function submitReschedule(token: string, startISO: string) {
  if (!token || !startISO) return { ok: false as const, error: "Missing details" };
  return rescheduleBooking(token, startISO);
}

export async function submitCancel(token: string, reason?: string) {
  if (!token) return { ok: false as const, error: "Missing token" };
  return cancelBooking(token, reason);
}
