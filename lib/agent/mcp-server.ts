import { createMcpHandler } from "mcp-handler";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AGENT_TOOLS, TOOLS_BY_NAME, type AgentContext } from "@/lib/agent/tools";

/**
 * Builds the LAPS MCP handler for a given tokenized endpoint. The resolved user
 * (`ctx`) is captured in the tool dispatcher's closure, so identity comes from
 * the URL token — no OAuth, and the server never emits an RFC 9728 challenge
 * (which is what made claude.ai demand OAuth Client ID/Secret).
 *
 * Handlers are cached per endpoint path (which embeds the token, so it maps to
 * one stable user). Revocation is still enforced upstream: the route re-checks
 * the token on every request before dispatching here.
 */

type McpHandler = (req: Request) => Response | Promise<Response>;

const cache = new Map<string, McpHandler>();

export function buildMcpHandler(endpointPath: string, ctx: AgentContext): McpHandler {
  const cached = cache.get(endpointPath);
  if (cached) return cached;

  const handler = createMcpHandler(
    (server) => {
      // Serve the JSON-Schema tool registry via low-level handlers (no zod).
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

      server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = TOOLS_BY_NAME[request.params.name];
        if (!tool) {
          return { content: [{ type: "text", text: `Unknown tool ${request.params.name}` }], isError: true };
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
    { streamableHttpEndpoint: endpointPath, disableSse: true, verboseLogs: false },
  );

  cache.set(endpointPath, handler);
  return handler;
}
