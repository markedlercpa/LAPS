import { prisma } from "@/lib/prisma";
import {
  TRUST_SCORE_MAX,
  TRUST_SIGNAL_WEIGHTS,
  type TrustSignalKind,
} from "@/lib/trust-taxonomy";

export * from "@/lib/trust-taxonomy";

/** Resolve the effective weight for a signal (explicit override, else default). */
export function resolveWeight(kind: TrustSignalKind, weight?: number | null): number {
  if (typeof weight === "number" && Number.isFinite(weight)) return Math.round(weight);
  return TRUST_SIGNAL_WEIGHTS[kind] ?? 0;
}

/**
 * Recompute and cache a lead's trust score from its signals. Score = sum of
 * signal weights, clamped to [0, 100]. Returns the new score.
 */
export async function recomputeTrustScore(leadId: string): Promise<number> {
  const agg = await prisma.trustSignal.aggregate({
    where: { leadId },
    _sum: { weight: true },
  });
  const raw = agg._sum.weight ?? 0;
  const score = Math.max(0, Math.min(TRUST_SCORE_MAX, raw));
  await prisma.lead.update({ where: { id: leadId }, data: { trustScore: score } });
  return score;
}

/**
 * Record a trust signal on a lead and refresh the cached score. `kind` picks a
 * default weight unless `weight` is supplied.
 */
export async function addTrustSignal(input: {
  leadId: string;
  kind: TrustSignalKind;
  weight?: number | null;
  note?: string | null;
  contentRef?: string | null;
  source?: string | null;
  occurredAt?: Date;
}): Promise<{ score: number; signalId: string }> {
  const weight = resolveWeight(input.kind, input.weight);
  const signal = await prisma.trustSignal.create({
    data: {
      leadId: input.leadId,
      kind: input.kind,
      weight,
      note: input.note ?? null,
      contentRef: input.contentRef ?? null,
      source: input.source ?? null,
      occurredAt: input.occurredAt ?? undefined,
    },
  });
  const score = await recomputeTrustScore(input.leadId);
  return { score, signalId: signal.id };
}
