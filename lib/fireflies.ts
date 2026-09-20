/**
 * Fireflies.ai connector — the first evidence feed for ECHO. Fireflies records
 * and transcribes sales/client calls; we pull transcripts here so their real
 * language can be distilled into EvidenceRecords.
 *
 * Server-only. Gated behind firefliesConfigured() (mirrors graphConfigured/
 * stripeConfigured): when no FIREFLIES_API_KEY is set the ECHO import UI shows
 * "not connected" instead of throwing.
 *
 * Hits the same GraphQL API (https://api.fireflies.ai/graphql, bearer key) that
 * the Fireflies MCP wraps.
 */

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

export function firefliesConfigured() {
  return Boolean(process.env.FIREFLIES_API_KEY);
}

export type FirefliesSentence = {
  text: string;
  speakerName: string | null;
};

export type FirefliesTranscript = {
  id: string;
  title: string;
  /** ISO date string; Fireflies returns a unix-ms number which we normalize. */
  date: string | null;
  durationMinutes: number | null;
  participants: string[];
  overview: string | null;
};

export type FirefliesTranscriptDetail = FirefliesTranscript & {
  sentences: FirefliesSentence[];
};

type GraphQLError = { message: string };

async function firefliesQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) throw new Error("Fireflies is not configured (set FIREFLIES_API_KEY).");

  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as
    | { data?: T; errors?: GraphQLError[] }
    | null;

  if (!res.ok || !payload) {
    throw new Error(`Fireflies request failed (${res.status}).`);
  }
  if (payload.errors?.length) {
    throw new Error(`Fireflies: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data) throw new Error("Fireflies returned no data.");
  return payload.data;
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === "string" && raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return new Date(n).toISOString();
    return raw;
  }
  return null;
}

/** Recent transcripts (metadata + overview, no sentences). Newest first. */
export async function listRecentTranscripts(limit = 20): Promise<FirefliesTranscript[]> {
  const data = await firefliesQuery<{
    transcripts: Array<{
      id: string;
      title: string | null;
      date: number | string | null;
      duration: number | null;
      participants: string[] | null;
      summary: { overview: string | null } | null;
    }>;
  }>(
    `query Transcripts($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        duration
        participants
        summary { overview }
      }
    }`,
    { limit: Math.min(Math.max(limit, 1), 50) },
  );

  return (data.transcripts ?? []).map((t) => ({
    id: t.id,
    title: t.title ?? "Untitled meeting",
    date: normalizeDate(t.date),
    durationMinutes: typeof t.duration === "number" ? Math.round(t.duration) : null,
    participants: t.participants ?? [],
    overview: t.summary?.overview ?? null,
  }));
}

/** A single transcript with its sentences (for distillation into evidence). */
export async function getTranscriptDetail(id: string): Promise<FirefliesTranscriptDetail> {
  const data = await firefliesQuery<{
    transcript: {
      id: string;
      title: string | null;
      date: number | string | null;
      duration: number | null;
      participants: string[] | null;
      summary: { overview: string | null } | null;
      sentences: Array<{ text: string | null; speaker_name: string | null }> | null;
    };
  }>(
    `query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        participants
        summary { overview }
        sentences { text speaker_name }
      }
    }`,
    { id },
  );

  const t = data.transcript;
  return {
    id: t.id,
    title: t.title ?? "Untitled meeting",
    date: normalizeDate(t.date),
    durationMinutes: typeof t.duration === "number" ? Math.round(t.duration) : null,
    participants: t.participants ?? [],
    overview: t.summary?.overview ?? null,
    sentences: (t.sentences ?? [])
      .filter((s): s is { text: string; speaker_name: string | null } => Boolean(s?.text))
      .map((s) => ({ text: s.text, speakerName: s.speaker_name })),
  };
}

/** Flatten a transcript's sentences into a single attributed text block. */
export function transcriptToText(detail: FirefliesTranscriptDetail): string {
  return detail.sentences
    .map((s) => (s.speakerName ? `${s.speakerName}: ${s.text}` : s.text))
    .join("\n");
}
