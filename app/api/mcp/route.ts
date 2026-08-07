/**
 * Base MCP path. The connector authenticates with a token embedded in the URL
 * (`/api/mcp/<token>`, see ./[token]/route.ts), so this bare path carries no
 * credential and does nothing but point callers at the right URL. Crucially it
 * returns a PLAIN error with no `WWW-Authenticate` OAuth challenge — emitting
 * one here is what made claude.ai demand OAuth Client ID/Secret.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function info() {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message:
          "Missing connector token. Use the tokenized URL /api/mcp/<token> from Pulse → Settings → Claude connector.",
      },
    },
    { status: 404 },
  );
}

export { info as GET, info as POST, info as DELETE };
