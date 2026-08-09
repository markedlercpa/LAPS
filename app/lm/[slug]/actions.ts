"use server";

import { prisma } from "@/lib/prisma";
import { captureSubmission, type CaptureInput, type CaptureResult } from "@/lib/leadmagnets/capture";
import { asQuizConfig, scoreQuiz, type QuizBand } from "@/lib/leadmagnets/quiz";

/** Public (unauthenticated) lead-magnet capture. Runs the Content → Leads
 * bridge and returns download access for file magnets. */
export async function captureMagnetAction(input: CaptureInput): Promise<CaptureResult> {
  return captureSubmission(input);
}

export type QuizResult =
  | { ok: false; error: string }
  | { ok: true; score: number; max: number; band: QuizBand | null; bookingSlug: string | null };

/** Public quiz submission: score the answers, resolve the band, run the same
 * capture bridge (with the quiz score folded into the lead's trust score), and
 * return the result for the on-screen + printable results page. */
export async function captureQuizAction(input: {
  slug: string;
  email: string;
  name?: string | null;
  company?: string | null;
  answers: Record<string, string>;
  source?: string | null;
  contentItemId?: string | null;
}): Promise<QuizResult> {
  const magnet = await prisma.leadMagnet.findFirst({ where: { slug: input.slug, status: "PUBLISHED", kind: "QUIZ" } });
  if (!magnet) return { ok: false, error: "This quiz isn’t available." };

  const config = asQuizConfig(magnet.config);
  const { score, band, max } = scoreQuiz(config, input.answers ?? {});

  const cap = await captureSubmission({
    slug: input.slug,
    email: input.email,
    name: input.name,
    company: input.company,
    source: input.source,
    contentItemId: input.contentItemId,
    computedScore: score,
    answers: { responses: input.answers, score, max, bandKey: band?.key ?? null },
  });
  if (!cap.ok) return { ok: false, error: cap.error };

  return { ok: true, score, max, band, bookingSlug: config.bookingSlug ?? null };
}
