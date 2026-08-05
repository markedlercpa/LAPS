"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findBannedPhrases } from "@/lib/echo";

const pillar = z.enum([
  "EARNINGS",
  "CASH_FLOW",
  "REPORTING",
  "GROWTH",
  "TAXATION",
  "CAPITAL",
  "LIFESTYLE",
  "VALUATION",
]);

const evidenceSchema = z.object({
  type: z.enum([
    "PAIN_POINT",
    "OBJECTION",
    "MYTH",
    "PRIZE_STATE",
    "CLIENT_STORY",
    "METHODOLOGY",
    "QUOTE",
    "DATA_POINT",
  ]),
  source: z.enum([
    "SALES_CALL",
    "CLIENT_ENGAGEMENT",
    "FIREFLIES_TRANSCRIPT",
    "EMAIL",
    "MANUAL",
  ]),
  sourceRef: z.string().optional(),
  rawText: z.string().min(1, "Raw text is required"),
  distilled: z.string().optional(),
  clientRef: z.string().optional(),
  consent: z.enum(["INTERNAL_ONLY", "ANONYMIZED", "PUBLIC"]),
  pillarTags: z.array(pillar).default([]),
  icpFit: z.boolean().default(false),
  icpNotes: z.string().optional(),
  strength: z.coerce.number().min(1).max(5).default(3),
});

export async function createEvidence(input: unknown) {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  await prisma.evidenceRecord.create({
    data: {
      type: d.type,
      source: d.source,
      sourceRef: d.sourceRef || null,
      rawText: d.rawText,
      distilled: d.distilled || null,
      clientRef: d.clientRef || null,
      consent: d.consent,
      pillarTags: d.pillarTags,
      icpFit: d.icpFit,
      icpNotes: d.icpNotes || null,
      strength: d.strength,
    },
  });
  revalidatePath("/echo/evidence");
  return { ok: true as const };
}

const cardSchema = z.object({
  cardText: z.string().min(1, "Card text is required"),
  category: z.enum([
    "HOOK",
    "REFRAME",
    "MANTRA",
    "OBJECTION_KILL",
    "PRIZE_FRAME",
    "MECHANISM_NAME",
  ]),
  pillarTags: z.array(pillar).default([]),
  status: z.enum(["CANDIDATE", "ACTIVE", "RETIRED"]).default("CANDIDATE"),
});

export async function createCallingCard(input: unknown) {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // Hard guardrail: banned phrases can never enter the bank.
  const banned = await findBannedPhrases(parsed.data.cardText);
  if (banned.length) {
    return { ok: false, error: `Contains retired/banned language: "${banned.join('", "')}"` };
  }
  await prisma.callingCard.create({
    data: {
      cardText: parsed.data.cardText,
      category: parsed.data.category,
      pillarTags: parsed.data.pillarTags,
      status: parsed.data.status,
    },
  });
  revalidatePath("/echo/calling-cards");
  return { ok: true as const };
}

export async function setCardStatus(id: string, status: "CANDIDATE" | "ACTIVE" | "RETIRED") {
  await prisma.callingCard.update({ where: { id }, data: { status } });
  revalidatePath("/echo/calling-cards");
  return { ok: true as const };
}
