import { resolveMcpToken } from "@/lib/agent/mcp-auth";
import { buildMcpHandler } from "@/lib/agent/mcp-server";

/**
 * Token-in-URL MCP endpoint for the Claude connector.
 *
 * The connector URL is `${APP_URL}/api/mcp/<token>` — the token in the path is
 * the credential, so Claude needs only the URL (no OAuth, no headers). We never
 * emit an OAuth `WWW-Authenticate` challenge, so claude.ai does not switch into
 * OAuth mode. The resolved token maps to one LAPS user; that user becomes the
 * agent context for every tool call. Revocation is enforced here on every
 * request (before dispatching to the cached per-token handler).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ctx = await resolveMcpToken(token);
  if (!ctx) {
    // Plain error — NOT a 401 with an OAuth challenge (that would make Claude
    // demand Client ID/Secret again).
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked connector token." } },
      { status: 404 },
    );
  }
  const handler = buildMcpHandler(`/api/mcp/${token}`, ctx);
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
