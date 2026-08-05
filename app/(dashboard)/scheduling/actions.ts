"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ensureHost, slugify } from "@/lib/booking";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

async function myHost() {
  const userId = await currentUserId();
  if (!userId) return null;
  return ensureHost(userId);
}

const hostSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().optional(),
  timezone: z.string().min(1),
  zoomLink: z.string().optional(),
  welcome: z.string().optional(),
  active: z.boolean().optional(),
});

export async function updateHost(input: unknown) {
  const host = await myHost();
  if (!host) return { ok: false as const, error: "Not signed in" };
  const parsed = hostSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };

  const slug = slugify(parsed.data.slug);
  const clash = await prisma.bookingHost.findFirst({
    where: { slug, id: { not: host.id } },
    select: { id: true },
  });
  if (clash) return { ok: false as const, error: "That link is taken — pick another." };

  await prisma.bookingHost.update({
    where: { id: host.id },
    data: {
      slug,
      displayName: parsed.data.displayName || null,
      timezone: parsed.data.timezone,
      zoomLink: parsed.data.zoomLink || null,
      welcome: parsed.data.welcome || null,
      active: parsed.data.active ?? host.active,
    },
  });
  revalidatePath("/scheduling");
  return { ok: true as const, slug };
}

const ruleSchema = z.object({ weekday: z.number().int().min(0).max(6), startMin: z.number().int(), endMin: z.number().int() });

/** Replace the full weekly availability in one shot. */
export async function saveAvailability(rules: unknown) {
  const host = await myHost();
  if (!host) return { ok: false as const, error: "Not signed in" };
  const parsed = z.array(ruleSchema).safeParse(rules);
  if (!parsed.success) return { ok: false as const, error: "Invalid availability" };
  const valid = parsed.data.filter((r) => r.endMin > r.startMin);

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { hostId: host.id } }),
    prisma.availabilityRule.createMany({
      data: valid.map((r) => ({ hostId: host.id, weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })),
    }),
  ]);
  revalidatePath("/scheduling");
  return { ok: true as const };
}

const questionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "phone"]).default("text"),
  required: z.boolean().default(false),
});

const eventSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().optional(),
  description: z.string().optional(),
  durationMin: z.coerce.number().int().positive().default(30),
  locationType: z.enum(["ZOOM", "PHONE", "IN_PERSON", "CUSTOM"]).default("ZOOM"),
  location: z.string().optional(),
  bufferBeforeMin: z.coerce.number().int().min(0).default(0),
  bufferAfterMin: z.coerce.number().int().min(0).default(0),
  minNoticeMin: z.coerce.number().int().min(0).default(240),
  rollingDays: z.coerce.number().int().positive().default(60),
  windowBusinessDays: z.coerce.number().int().positive().nullable().optional(),
  maxPerDay: z.coerce.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
  questions: z.array(questionSchema).default([]),
});

export async function saveEventType(input: unknown) {
  const host = await myHost();
  if (!host) return { ok: false as const, error: "Not signed in" };
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  let slug = slugify(d.slug || d.name);
  const clash = await prisma.bookingEventType.findFirst({
    where: { hostId: host.id, slug, ...(d.id ? { id: { not: d.id } } : {}) },
    select: { id: true },
  });
  if (clash) slug = `${slug}-${Math.floor(Date.now() / 1000) % 1000}`;

  const data = {
    name: d.name,
    slug,
    description: d.description || null,
    durationMin: d.durationMin,
    locationType: d.locationType,
    location: d.location || null,
    bufferBeforeMin: d.bufferBeforeMin,
    bufferAfterMin: d.bufferAfterMin,
    minNoticeMin: d.minNoticeMin,
    rollingDays: d.rollingDays,
    windowBusinessDays: d.windowBusinessDays ?? null,
    maxPerDay: d.maxPerDay ?? null,
    active: d.active,
    questions: d.questions,
  };

  if (d.id) {
    await prisma.bookingEventType.update({ where: { id: d.id }, data });
  } else {
    await prisma.bookingEventType.create({ data: { ...data, hostId: host.id } });
  }
  revalidatePath("/scheduling");
  return { ok: true as const };
}

export async function toggleEventActive(id: string, active: boolean) {
  const host = await myHost();
  if (!host) return { ok: false as const, error: "Not signed in" };
  await prisma.bookingEventType.updateMany({ where: { id, hostId: host.id }, data: { active } });
  revalidatePath("/scheduling");
  return { ok: true as const };
}

export async function deleteEventType(id: string) {
  const host = await myHost();
  if (!host) return { ok: false as const, error: "Not signed in" };
  await prisma.bookingEventType.deleteMany({ where: { id, hostId: host.id } });
  revalidatePath("/scheduling");
  return { ok: true as const };
}
