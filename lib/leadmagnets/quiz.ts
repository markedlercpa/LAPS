// Quiz / scorecard config + scoring. Pure + client-safe (no prisma/server).
// The config lives in LeadMagnet.config (JSON) for QUIZ-kind magnets.

export type QuizOption = { id: string; label: string; weight: number };
export type QuizQuestion = { id: string; prompt: string; options: QuizOption[] };
/** A score band → an archetype/result shown on the results page. */
export type QuizBand = {
  key: string;
  label: string;
  min: number; // inclusive
  max: number; // inclusive
  headline?: string;
  body?: string;
  recommendations?: string[];
};
export type QuizConfig = {
  questions: QuizQuestion[];
  bands: QuizBand[];
  resultIntro?: string;
  bookingSlug?: string; // optional: link results CTA to a /book/[slug]
};

export function emptyQuizConfig(): QuizConfig {
  return { questions: [], bands: [] };
}

/** Coerce an unknown JSON blob into a QuizConfig, dropping malformed bits. */
export function asQuizConfig(raw: unknown): QuizConfig {
  const c = (raw ?? {}) as Partial<QuizConfig>;
  const questions: QuizQuestion[] = Array.isArray(c.questions)
    ? c.questions
        .filter((q): q is QuizQuestion => !!q && typeof q.prompt === "string" && Array.isArray(q.options))
        .map((q) => ({
          id: q.id || cryptoId(),
          prompt: q.prompt,
          options: q.options
            .filter((o): o is QuizOption => !!o && typeof o.label === "string")
            .map((o) => ({ id: o.id || cryptoId(), label: o.label, weight: Number(o.weight) || 0 })),
        }))
    : [];
  const bands: QuizBand[] = Array.isArray(c.bands)
    ? c.bands
        .filter((b): b is QuizBand => !!b && typeof b.label === "string")
        .map((b) => ({
          key: b.key || cryptoId(),
          label: b.label,
          min: Number(b.min) || 0,
          max: Number.isFinite(Number(b.max)) ? Number(b.max) : 0,
          headline: b.headline,
          body: b.body,
          recommendations: Array.isArray(b.recommendations) ? b.recommendations.filter((r) => typeof r === "string") : [],
        }))
    : [];
  return { questions, bands, resultIntro: c.resultIntro, bookingSlug: c.bookingSlug };
}

/** Max attainable score — sum of the highest-weight option per question. */
export function quizMaxScore(config: QuizConfig): number {
  return config.questions.reduce((s, q) => s + Math.max(0, ...q.options.map((o) => o.weight), 0), 0);
}

/** Score a set of answers (questionId → optionId) and resolve its band. */
export function scoreQuiz(
  config: QuizConfig,
  answers: Record<string, string>,
): { score: number; band: QuizBand | null; max: number } {
  let score = 0;
  for (const q of config.questions) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (chosen) score += chosen.weight;
  }
  const bands = [...config.bands].sort((a, b) => a.min - b.min);
  const band = bands.find((b) => score >= b.min && score <= b.max) ?? bands[bands.length - 1] ?? null;
  return { score, band, max: quizMaxScore(config) };
}

/** Small id for new questions/options/bands (client + server safe). */
export function cryptoId(): string {
  return "q" + Math.random().toString(36).slice(2, 10);
}
