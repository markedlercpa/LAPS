"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const channel = z.enum([
  "LINKEDIN",
  "X",
  "EMAIL",
  "NEWSLETTER",
  "BLOG",
  "YOUTUBE",
  "PODCAST",
  "WEBSITE",
  "BOOK",
  "OTHER",
]);

const snapshotSchema = z.object({
  contentItemId: z.string().optional(),
  channel: channel.optional(),
  impressions: z.coerce.number().int().min(0).default(0),
  engagements: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  conversions: z.coerce.number().int().min(0).default(0),
  note: z.string().optional(),
  source: z.string().optional(),
});

/** Record a manually-aggregated performance snapshot. */
export async function createMetricSnapshot(input: unknown) {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // If tied to a content item, inherit its channel when none was given.
  let ch = d.channel;
  if (d.contentItemId && !ch) {
    const item = await prisma.contentItem.findUnique({
      where: { id: d.contentItemId },
      select: { channel: true },
    });
    ch = item?.channel;
  }

  await prisma.metricSnapshot.create({
    data: {
      contentItemId: d.contentItemId || null,
      channel: ch ?? null,
      impressions: d.impressions,
      engagements: d.engagements,
      clicks: d.clicks,
      conversions: d.conversions,
      note: d.note || null,
      source: d.source || null,
    },
  });
  revalidatePath("/marketing/optics");
  return { ok: true as const };
}
