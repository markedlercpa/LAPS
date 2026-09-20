// Diagnostic / audit-call application config + qualification scoring.
// Pure + client-safe. Config lives in LeadMagnet.config for AUDIT_CALL magnets.
// An application collects qualifying answers, scores them, and — when the lead
// clears the threshold — hands off to the existing booking engine (/book/[slug]).

import { cryptoId, type QuizOption } from "@/lib/leadmagnets/quiz";

export type AuditQuestion = {
  id: string;
  prompt: string;
  type: "select" | "text";
  options?: QuizOption[]; // for type "select" (weighted)
  required?: boolean;
};

export type AuditConfig = {
  intro?: string;
  questions: AuditQuestion[];
  bookingSlug?: string; // the /book/[slug] event to schedule after qualifying
  minScore?: number; // qualify threshold; undefined = everyone qualifies
  disqualifyMessage?: string;
};

export function emptyAuditConfig(): AuditConfig {
  return { questions: [] };
}

export function asAuditConfig(raw: unknown): AuditConfig {
  const c = (raw ?? {}) as Partial<AuditConfig>;
  const questions: AuditQuestion[] = Array.isArray(c.questions)
    ? c.questions
        .filter((q): q is AuditQuestion => !!q && typeof q.prompt === "string")
        .map((q) => ({
          id: q.id || cryptoId(),
          prompt: q.prompt,
          type: q.type === "text" ? "text" : "select",
          required: Boolean(q.required),
          options: Array.isArray(q.options)
            ? q.options
                .filter((o): o is QuizOption => !!o && typeof o.label === "string")
                .map((o) => ({ id: o.id || cryptoId(), label: o.label, weight: Number(o.weight) || 0 }))
            : [],
        }))
    : [];
  return {
    intro: c.intro,
    questions,
    bookingSlug: c.bookingSlug,
    minScore: c.minScore != null ? Number(c.minScore) || 0 : undefined,
    disqualifyMessage: c.disqualifyMessage,
  };
}

/** Sum the weights of the selected options (text answers score 0). */
export function scoreAudit(config: AuditConfig, answers: Record<string, string>): number {
  let score = 0;
  for (const q of config.questions) {
    if (q.type !== "select") continue;
    const chosen = q.options?.find((o) => o.id === answers[q.id]);
    if (chosen) score += chosen.weight;
  }
  return score;
}

export function qualifies(config: AuditConfig, score: number): boolean {
  return config.minScore == null || score >= config.minScore;
}
