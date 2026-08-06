import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { runAgentTurn, agentConfigured, type Decision } from "@/lib/agent/run";

/**
 * Session-authenticated chat endpoint for the embedded LAPS assistant. Unlike
 * the rest of /api/agent/* (bearer-token, headless), this route acts on behalf
 * of the signed-in rep, so it authenticates with the user session and passes
 * their identity as the agent's context (ownership / send-as). The client holds
 * the transcript; write tools pause here for in-chat confirmation.
 */

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  if (!agentConfigured()) {
    return json({ error: "The assistant is not configured (set ANTHROPIC_API_KEY)." }, 503);
  }

  const session = await auth();
  if (!session?.user?.id) return json({ error: "Not signed in" }, 401);

  const body = (await req.json().catch(() => null)) as
    | { messages?: unknown; decision?: unknown }
    | null;
  if (!body || !Array.isArray(body.messages)) {
    return json({ error: "Body must include a `messages` array." }, 400);
  }

  const decision =
    body.decision === "confirm" || body.decision === "reject"
      ? (body.decision as Decision)
      : undefined;

  const result = await runAgentTurn({
    messages: body.messages as Anthropic.MessageParam[],
    decision,
    ctx: {
      userId: session.user.id,
      role: (session.user as { role?: string }).role,
      name: session.user.name,
      email: session.user.email,
    },
  });

  return json(result);
}
