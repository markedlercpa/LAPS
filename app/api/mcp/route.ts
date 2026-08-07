import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AGENT_TOOLS, TOOLS_BY_NAME, type AgentContext } from "@/lib/agent/tools";
import { resolveMcpToken } from "@/lib/agent/mcp-auth";

/**
 * Remote MCP server that exposes LAPS to Claude as a custom connector.
 *
 * Auth is a per-user bearer token (see lib/agent/mcp-auth.ts) presented in the
 * connector's request headers — claude.ai supports this, so no OAuth is needed.
 * The resolved user becomes the agent context, so every tool acts as that LAPS
 * user (ownership / send-as). Reads run freely; claude.ai's own approval prompt
 * is the human gate before each write. The same tool registry powers the
 * in-app assistant — this route just wraps it in the MCP protocol.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    // Serve our JSON-Schema tool registry via the low-level handlers (no zod
    // conversion — the tools already carry raw JSON Schema).
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: AGENT_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
        annotations: {
          readOnlyHint: t.mode === "read",
          destructiveHint: t.name.startsWith("delete"),
        },
      })),
    }));

    server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const tool = TOOLS_BY_NAME[request.params.name];
      if (!tool) {
        return { content: [{ type: "text", text: `Unknown tool ${request.params.name}` }], isError: true };
      }
      const ctx = extra?.authInfo?.extra as AgentContext | undefined;
      if (!ctx?.userId) {
        return { content: [{ type: "text", text: "Unauthorized: missing user context." }], isError: true };
      }
      const input = (request.params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(input, ctx);
        return { content: [{ type: "text", text: JSON.stringify(result) }], isError: !result.ok };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : "Tool failed." }],
          isError: true,
        };
      }
    });
  },
  { capabilities: { tools: {} }, serverInfo: { name: "LAPS", version: "1.0.0" } },
  { streamableHttpEndpoint: "/api/mcp", disableSse: true, verboseLogs: false },
);

// Wrap with bearer-token auth. `required: true` → an absent/invalid token gets a
// 401 with an RFC 9728 WWW-Authenticate challenge before reaching a tool.
const handler = experimental_withMcpAuth(
  mcpHandler,
  async (_req, bearer) => {
    const ctx = await resolveMcpToken(bearer);
    if (!ctx) return undefined;
    return { token: bearer as string, clientId: ctx.userId, scopes: ["laps"], extra: ctx };
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };
