import { prisma } from "@/lib/prisma";

/**
 * Auth for the agent HTTP API (/api/agent/*). LAPS is agent-managed: an agent
 * calls these endpoints with a bearer token (AGENT_API_KEY) to create and fill
 * records so humans don't do data entry. Keep the key server-side only.
 */

export function agentConfigured() {
  return Boolean(process.env.AGENT_API_KEY);
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/** Returns null when the request is authorized, otherwise an error Response. */
export function requireAgent(req: Request): Response | null {
  const key = process.env.AGENT_API_KEY;
  if (!key) return json({ error: "Agent API is not configured (set AGENT_API_KEY)." }, 503);
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== key) return json({ error: "Unauthorized" }, 401);
  return null;
}

/** Fallback owner/sender for agent-created records: the earliest ADMIN user. */
export async function defaultOwnerId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}
