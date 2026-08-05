import { randomUUID } from "crypto";
import type { BookingEventType, BookingHost } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fetchBusyWindows,
  createCalendarEvent,
  deleteCalendarEvent,
  sendMailAsUser,
  graphConfigured,
  type BusyWindow,
} from "@/lib/graph";
import {
  zonedTimeToUtc,
  formatDateInZone,
  formatTimeInZone,
} from "@/lib/booking-time";

const DAY_MS = 86_400_000;

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "host"
  );
}

/** Get (or lazily create) the booking host profile for a user. */
export async function ensureHost(userId: string): Promise<BookingHost> {
  const existing = await prisma.bookingHost.findUnique({ where: { userId } });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const base = slugify(user?.name || user?.email?.split("@")[0] || "host");
  // Ensure slug uniqueness.
  let slug = base;
  for (let i = 2; await prisma.bookingHost.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  const host = await prisma.bookingHost.create({
    data: {
      userId,
      slug,
      displayName: user?.name ?? null,
      timezone: "America/New_York",
    },
  });

  // Seed sensible default availability: Mon–Fri, 9:00–17:00.
  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      hostId: host.id,
      weekday,
      startMin: 9 * 60,
      endMin: 17 * 60,
    })),
  });

  // Seed a default event type.
  await prisma.bookingEventType.create({
    data: {
      hostId: host.id,
      slug: "intro-call",
      name: "Intro Call",
      description: "A quick introductory call.",
      durationMin: 30,
      minNoticeMin: 240,
      rollingDays: 60,
    },
  });

  return host;
}

type Rule = { weekday: number; startMin: number; endMin: number };
type Override = { date: Date; available: boolean; startMin: number | null; endMin: number | null };

function overlaps(aStart: number, aEnd: number, b: BusyWindow): boolean {
  return aStart < b.end.getTime() && aEnd > b.start.getTime();
}

/**
 * Compute available slot start instants (UTC ISO) for a host + event type over
 * the rolling window. Availability is in the host's timezone; conflicts come
 * from existing LAPS bookings and (if connected) the host's Outlook calendar.
 */
export async function computeSlots(opts: {
  hostUserId: string;
  timezone: string;
  rules: Rule[];
  overrides: Override[];
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  rollingDays: number;
  maxPerDay: number | null;
  now?: Date;
  excludeAppointmentId?: string;
}): Promise<string[]> {
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - DAY_MS);
  const windowEnd = new Date(now.getTime() + (opts.rollingDays + 1) * DAY_MS);

  // Busy: existing LAPS bookings for this host.
  const appts = await prisma.appointment.findMany({
    where: {
      ownerId: opts.hostUserId,
      status: "BOOKED",
      scheduledAt: { gte: windowStart, lte: windowEnd },
      ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
    },
    select: { id: true, scheduledAt: true, durationMin: true },
  });
  const busy: BusyWindow[] = appts.map((a) => ({
    start: a.scheduledAt,
    end: new Date(a.scheduledAt.getTime() + a.durationMin * 60000),
  }));

  // Busy: Outlook calendar (best-effort; empty when not connected).
  try {
    const outlook = await fetchBusyWindows(
      opts.hostUserId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );
    busy.push(...outlook);
  } catch {
    /* ignore calendar failures — bookings still work off LAPS data */
  }

  // Bookings-per-day cap (local day key), counted from LAPS bookings.
  const perDay = new Map<string, number>();
  const overridesByKey = new Map<string, Override>();
  for (const o of opts.overrides) {
    const d = o.date;
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    overridesByKey.set(key, o);
  }

  const minInstant = now.getTime() + opts.minNoticeMin * 60000;
  const step = opts.durationMin;
  const slots: string[] = [];

  // Enumerate calendar days using a floating UTC midnight so DST never drifts
  // the day index. The wall Y/M/D come straight off that floating date.
  const startParts = new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const gp = (t: string) => Number(startParts.find((p) => p.type === t)?.value);
  const floatBase = Date.UTC(gp("year"), gp("month") - 1, gp("day"));

  for (let i = 0; i <= opts.rollingDays; i++) {
    const dayFloat = new Date(floatBase + i * DAY_MS);
    const Y = dayFloat.getUTCFullYear();
    const M = dayFloat.getUTCMonth(); // 0-11
    const D = dayFloat.getUTCDate();
    const weekday = dayFloat.getUTCDay();
    const dayKey = `${Y}-${M}-${D}`;

    // Windows for the day: override wins, else weekly rules.
    let windows: { startMin: number; endMin: number }[];
    const ov = overridesByKey.get(dayKey);
    if (ov) {
      if (!ov.available) continue;
      windows =
        ov.startMin != null && ov.endMin != null
          ? [{ startMin: ov.startMin, endMin: ov.endMin }]
          : opts.rules.filter((r) => r.weekday === weekday);
    } else {
      windows = opts.rules.filter((r) => r.weekday === weekday);
    }
    if (windows.length === 0) continue;

    if (opts.maxPerDay != null && (perDay.get(dayKey) ?? 0) >= opts.maxPerDay) continue;

    for (const w of windows) {
      for (let s = w.startMin; s + opts.durationMin <= w.endMin; s += step) {
        const startUtc = zonedTimeToUtc(Y, M, D, Math.floor(s / 60), s % 60, opts.timezone);
        const startMs = startUtc.getTime();
        const endMs = startMs + opts.durationMin * 60000;
        if (startMs < minInstant) continue;

        const bufStart = startMs - opts.bufferBeforeMin * 60000;
        const bufEnd = endMs + opts.bufferAfterMin * 60000;
        const conflict = busy.some((b) => overlaps(bufStart, bufEnd, b));
        if (conflict) continue;

        slots.push(startUtc.toISOString());
      }
    }
  }

  return [...new Set(slots)].sort();
}

/** Load the full config needed to compute slots for one event type. */
export async function loadEventForSlots(hostId: string, eventTypeId: string) {
  const [event, rules, overrides] = await Promise.all([
    prisma.bookingEventType.findFirst({ where: { id: eventTypeId, hostId } }),
    prisma.availabilityRule.findMany({ where: { hostId } }),
    prisma.availabilityOverride.findMany({ where: { hostId } }),
  ]);
  return { event, rules, overrides };
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? full, last: parts.slice(1).join(" ") };
}

function resolveLocation(event: BookingEventType, host: BookingHost): string | null {
  if (event.location) return event.location;
  if (event.locationType === "ZOOM") return host.zoomLink ?? null;
  return null;
}

function confirmationHtml(opts: {
  inviteeName: string;
  eventName: string;
  hostName: string;
  whenLabel: string;
  location: string | null;
  rescheduleUrl: string;
  cancelUrl: string;
}): string {
  return `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#201e1d">
      <p>Hi ${opts.inviteeName},</p>
      <p>Your <strong>${opts.eventName}</strong> with ${opts.hostName} is confirmed.</p>
      <p><strong>When:</strong> ${opts.whenLabel}</p>
      ${opts.location ? `<p><strong>Where:</strong> <a href="${opts.location}">${opts.location}</a></p>` : ""}
      <p style="margin-top:16px">
        Need to change it?
        <a href="${opts.rescheduleUrl}">Reschedule</a> ·
        <a href="${opts.cancelUrl}">Cancel</a>
      </p>
    </div>`;
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Create a booking from the public page: match/create lead, book, notify. */
export async function createBooking(input: {
  eventTypeId: string;
  startISO: string;
  name: string;
  email: string;
  phone?: string;
  inviteeTimezone: string;
  answers?: Record<string, string>;
}): Promise<
  | { ok: true; appointmentId: string; cancelToken: string; rescheduleToken: string }
  | { ok: false; error: string }
> {
  const event = await prisma.bookingEventType.findUnique({
    where: { id: input.eventTypeId },
    include: { host: { include: { user: true } } },
  });
  if (!event || !event.active) return { ok: false, error: "This meeting type is unavailable." };
  const host = event.host;

  // Revalidate the slot server-side (guards against races + tampering).
  const { rules, overrides } = await loadEventForSlots(host.id, event.id);
  const slots = await computeSlots({
    hostUserId: host.userId,
    timezone: host.timezone,
    rules,
    overrides,
    durationMin: event.durationMin,
    bufferBeforeMin: event.bufferBeforeMin,
    bufferAfterMin: event.bufferAfterMin,
    minNoticeMin: event.minNoticeMin,
    rollingDays: event.rollingDays,
    maxPerDay: event.maxPerDay,
  });
  if (!slots.includes(input.startISO)) {
    return { ok: false, error: "That time is no longer available. Please pick another." };
  }

  const start = new Date(input.startISO);
  const end = new Date(start.getTime() + event.durationMin * 60000);
  const location = resolveLocation(event, host);

  // Match or create the lead.
  const email = input.email.trim();
  let lead = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  const { first, last } = splitName(input.name);
  if (lead) {
    if (lead.stage === "NEW") {
      await prisma.lead.update({ where: { id: lead.id }, data: { stage: "APPOINTMENT" } });
    }
  } else {
    lead = await prisma.lead.create({
      data: {
        firstName: first,
        lastName: last,
        email,
        phone: input.phone || null,
        leadSource: "Booking page",
        stage: "APPOINTMENT",
        ownerId: host.userId,
      },
    });
  }

  const rescheduleToken = randomUUID();
  const cancelToken = randomUUID();

  const appt = await prisma.appointment.create({
    data: {
      leadId: lead.id,
      ownerId: host.userId,
      eventTypeId: event.id,
      title: `${event.name} — ${input.name}`,
      scheduledAt: start,
      durationMin: event.durationMin,
      status: "BOOKED",
      inviteeName: input.name,
      inviteeEmail: email,
      inviteePhone: input.phone || null,
      timezone: input.inviteeTimezone,
      location,
      meetingUrl: location,
      answers: input.answers ?? undefined,
      rescheduleToken,
      cancelToken,
      bookedVia: "booking_page",
    },
  });

  // Log to the lead timeline.
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      userId: host.userId,
      type: "MEETING",
      direction: "IN",
      subject: `Booked: ${event.name}`,
      body: `${input.name} booked "${event.name}" for ${formatDateInZone(start, host.timezone)} at ${formatTimeInZone(start, host.timezone)} (${host.timezone}).`,
      occurredAt: new Date(),
    },
  });

  // Best-effort: put it on the host's Outlook calendar.
  const eventId = await createCalendarEvent(host.userId, {
    subject: `${event.name} — ${input.name}`,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    location: location ?? undefined,
    bodyHtml: `Booked via LAPS. ${location ? `Join: ${location}` : ""}`,
    attendees: [{ email, name: input.name }],
  });
  if (eventId) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { graphEventId: eventId } });
  }

  // Best-effort: confirmation emails.
  await sendConfirmationEmails(appt.id);

  return { ok: true, appointmentId: appt.id, cancelToken, rescheduleToken };
}

/** Send confirmation emails for an appointment (invitee + host). Best-effort. */
export async function sendConfirmationEmails(appointmentId: string): Promise<void> {
  if (!graphConfigured()) return;
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { eventType: { include: { host: { include: { user: true } } } } },
  });
  if (!appt || !appt.eventType || !appt.inviteeEmail) return;
  const host = appt.eventType.host;
  const inviteeTz = appt.timezone || host.timezone;
  const whenLabel = `${formatDateInZone(appt.scheduledAt, inviteeTz)} · ${formatTimeInZone(appt.scheduledAt, inviteeTz)} (${inviteeTz})`;
  const hostName = host.displayName || host.user?.name || "our team";
  const b = baseUrl();

  const html = confirmationHtml({
    inviteeName: appt.inviteeName || "there",
    eventName: appt.eventType.name,
    hostName,
    whenLabel,
    location: appt.meetingUrl,
    rescheduleUrl: `${b}/book/${host.slug}/${appt.eventType.slug}?reschedule=${appt.rescheduleToken}`,
    cancelUrl: `${b}/book/cancel/${appt.cancelToken}`,
  });

  await sendMailAsUser({
    userId: host.userId,
    to: appt.inviteeEmail,
    subject: `Confirmed: ${appt.eventType.name} · ${whenLabel}`,
    html,
  });
  // Notify the host too.
  if (host.user?.email) {
    await sendMailAsUser({
      userId: host.userId,
      to: host.user.email,
      subject: `New booking: ${appt.eventType.name} with ${appt.inviteeName}`,
      html: `<p>${appt.inviteeName} (${appt.inviteeEmail}) booked <strong>${appt.eventType.name}</strong>.</p><p>${whenLabel}</p>`,
    });
  }
}

/** Reschedule to a new slot via the reschedule token. */
export async function rescheduleBooking(token: string, newStartISO: string) {
  const appt = await prisma.appointment.findUnique({
    where: { rescheduleToken: token },
    include: { eventType: { include: { host: true } } },
  });
  if (!appt || !appt.eventType || appt.status === "CANCELED") {
    return { ok: false as const, error: "Booking not found." };
  }
  const event = appt.eventType;
  const host = event.host;

  const { rules, overrides } = await loadEventForSlots(host.id, event.id);
  const slots = await computeSlots({
    hostUserId: host.userId,
    timezone: host.timezone,
    rules,
    overrides,
    durationMin: event.durationMin,
    bufferBeforeMin: event.bufferBeforeMin,
    bufferAfterMin: event.bufferAfterMin,
    minNoticeMin: event.minNoticeMin,
    rollingDays: event.rollingDays,
    maxPerDay: event.maxPerDay,
    excludeAppointmentId: appt.id,
  });
  if (!slots.includes(newStartISO)) {
    return { ok: false as const, error: "That time is no longer available." };
  }

  const start = new Date(newStartISO);
  const end = new Date(start.getTime() + event.durationMin * 60000);

  // Move the Outlook event: delete old, create fresh.
  if (appt.graphEventId) await deleteCalendarEvent(host.userId, appt.graphEventId);
  const eventId = await createCalendarEvent(host.userId, {
    subject: appt.title,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    location: appt.meetingUrl ?? undefined,
    attendees: appt.inviteeEmail ? [{ email: appt.inviteeEmail, name: appt.inviteeName ?? undefined }] : [],
  });

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { scheduledAt: start, graphEventId: eventId, reminderSentAt: null },
  });
  await sendConfirmationEmails(appt.id);
  return { ok: true as const, hostSlug: host.slug, eventSlug: event.slug };
}

/** Cancel via the cancel token. */
export async function cancelBooking(token: string, reason?: string) {
  const appt = await prisma.appointment.findUnique({
    where: { cancelToken: token },
    include: { eventType: { include: { host: { include: { user: true } } } } },
  });
  if (!appt) return { ok: false as const, error: "Booking not found." };
  if (appt.status === "CANCELED") return { ok: true as const, already: true };

  if (appt.graphEventId) await deleteCalendarEvent(appt.ownerId!, appt.graphEventId);
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "CANCELED", notes: reason ? `Canceled: ${reason}` : appt.notes },
  });

  if (appt.leadId) {
    await prisma.activity.create({
      data: {
        leadId: appt.leadId,
        userId: appt.ownerId,
        type: "MEETING",
        direction: "IN",
        subject: `Canceled: ${appt.eventType?.name ?? appt.title}`,
        body: reason ? `Reason: ${reason}` : "Booking canceled by invitee.",
        occurredAt: new Date(),
      },
    });
  }

  // Notify host.
  const host = appt.eventType?.host;
  if (graphConfigured() && host?.user?.email && appt.ownerId) {
    await sendMailAsUser({
      userId: appt.ownerId,
      to: host.user.email,
      subject: `Canceled: ${appt.eventType?.name} with ${appt.inviteeName}`,
      html: `<p>${appt.inviteeName} canceled their booking.</p>${reason ? `<p>Reason: ${reason}</p>` : ""}`,
    });
  }
  return { ok: true as const };
}
