"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findBannedPhrases } from "@/lib/echo";
import {
  firefliesConfigured,
  listRecentTranscripts,
  getTranscriptDetail,
  transcriptToText,
} from "@/lib/fireflies";

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
  revalidatePath("/marketing/evidence");
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
  revalidatePath("/marketing/calling-cards");
  return { ok: true as const };
}

export async function setCardStatus(id: string, status: "CANDIDATE" | "ACTIVE" | "RETIRED") {
  await prisma.callingCard.update({ where: { id }, data: { status } });
  revalidatePath("/marketing/calling-cards");
  return { ok: true as const };
}

// ── Fireflies evidence feed ───────────────────────────────────────────────

/** List recent Fireflies transcripts for the import picker (human-visible). */
export async function listFirefliesForImport() {
  if (!firefliesConfigured()) {
    return { ok: false as const, configured: false, transcripts: [] };
  }
  try {
    const transcripts = await listRecentTranscripts(25);
    // Flag which are already in the vault so we don't double-import.
    const refs = transcripts.map((t) => `fireflies:${t.id}`);
    const existing = await prisma.evidenceRecord.findMany({
      where: { sourceRef: { in: refs } },
      select: { sourceRef: true },
    });
    const imported = new Set(existing.map((e) => e.sourceRef));
    return {
      ok: true as const,
      configured: true,
      transcripts: transcripts.map((t) => ({
        ...t,
        imported: imported.has(`fireflies:${t.id}`),
      })),
    };
  } catch (e) {
    return {
      ok: false as const,
      configured: true,
      transcripts: [],
      error: e instanceof Error ? e.message : "Fireflies request failed",
    };
  }
}

/**
 * Import a Fireflies transcript as a raw evidence candidate. Stored with
 * INTERNAL_ONLY consent and the meeting title as the (internal) clientRef; a
 * human or agent then distills + tags it. Idempotent per transcript.
 */
export async function importFirefliesTranscript(transcriptId: string) {
  if (!firefliesConfigured()) {
    return { ok: false as const, error: "Fireflies is not connected." };
  }
  const sourceRef = `fireflies:${transcriptId}`;
  const already = await prisma.evidenceRecord.findFirst({ where: { sourceRef } });
  if (already) return { ok: true as const, id: already.id, alreadyImported: true };

  try {
    const detail = await getTranscriptDetail(transcriptId);
    const rawText = transcriptToText(detail);
    if (!rawText.trim()) {
      return { ok: false as const, error: "Transcript has no content yet." };
    }
    const record = await prisma.evidenceRecord.create({
      data: {
        type: "CLIENT_STORY",
        source: "FIREFLIES_TRANSCRIPT",
        sourceRef,
        rawText,
        distilled: detail.overview || null,
        clientRef: detail.title,
        consent: "INTERNAL_ONLY",
        pillarTags: [],
        strength: 3,
      },
    });
    revalidatePath("/marketing/evidence");
    return { ok: true as const, id: record.id, alreadyImported: false };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Import failed" };
  }
}
