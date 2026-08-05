import { requireAgent, json } from "@/lib/agent-auth";
import {
  firefliesConfigured,
  listRecentTranscripts,
  getTranscriptDetail,
  transcriptToText,
} from "@/lib/fireflies";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/echo/transcripts        — recent Fireflies transcripts (metadata)
 * GET /api/agent/echo/transcripts?id=XXX — one transcript's full attributed text
 *
 * The agent pulls transcripts here, distills them, then POSTs the resulting
 * evidence records to /api/agent/echo/evidence.
 */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;

  if (!firefliesConfigured()) {
    return json({ configured: false, error: "Fireflies is not configured." }, 503);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const detail = await getTranscriptDetail(id);
      return json({ configured: true, transcript: { ...detail, text: transcriptToText(detail) } });
    }
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const transcripts = await listRecentTranscripts(Number.isFinite(limit) ? limit : 25);
    return json({ configured: true, transcripts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fireflies request failed" }, 502);
  }
}
