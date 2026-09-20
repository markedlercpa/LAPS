import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_TOOLS,
  TOOLS_BY_NAME,
  anthropicToolDefs,
  confirmSummaryFor,
  type AgentContext,
} from "@/lib/agent/tools";

/**
 * The embedded chat agent's server-side loop. Reads execute inline; the loop
 * stops at the first write tool call and hands a confirmation request back to
 * the browser. The client re-POSTs the transcript with the user's decision and
 * the loop resumes. This keeps the human in control of every write while the
 * route handler stays stateless (the client holds the transcript).
 */

export function agentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.ANTHROPIC_AGENT_MODEL || "claude-opus-5";
const MAX_ITERATIONS = 12;

export type PendingWrite = { id: string; name: string; input: Record<string, unknown> };
export type Decision = "confirm" | "reject";

export type AgentTurnResult =
  | { type: "message"; text: string; messages: Anthropic.MessageParam[] }
  | {
      type: "confirm";
      summary: string;
      toolName: string;
      pending: PendingWrite;
      messages: Anthropic.MessageParam[];
    }
  | { type: "error"; error: string; messages: Anthropic.MessageParam[] };

function systemPrompt(ctx: AgentContext, today: string): string {
  return [
    "You are the LAPS assistant — an embedded agent inside LAPS, the internal ERP/CRM for Edler Zain, a CPA and M&A advisory firm.",
    `You are helping ${ctx.name || "a team member"} (${ctx.email || "unknown email"}), role ${ctx.role || "REP"}. Today is ${today}.`,
    "You act on their behalf: their leads, appointments, tasks, proposals, and mailbox.",
    "",
    "Tool policy:",
    "- Read tools (list/get/summary) run immediately — use them freely to answer questions and to gather the exact ids/times you need before proposing a write.",
    "- Write tools (create/update/delete/send/book) are gated: when you call one, the user is shown a confirmation card and must approve before it runs. So call a write tool as soon as you have the details — do not ask 'should I?' in prose first; the confirmation card IS the approval step.",
    "- Never invent ids. Look them up with a read tool first (e.g. list_leads before update_lead, list_event_types before book_call).",
    "- Do one write at a time; wait for its result before the next.",
    "",
    "Be concise and concrete. When you report what you did or found, use plain language and reference names, not raw ids, where possible.",
  ].join("\n");
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function firstToolUse(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  return (
    (message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined) ?? null
  );
}

/**
 * Run one "turn" of the agent to a stopping point: either a final assistant
 * message, or a pending write awaiting confirmation.
 *
 * @param messages   full transcript so far (client-held)
 * @param decision   set only when resuming a pending write from the client
 * @param ctx        the signed-in rep (source of truth for ownership/send-as)
 */
export async function runAgentTurn(opts: {
  messages: Anthropic.MessageParam[];
  decision?: Decision;
  ctx: AgentContext;
  today?: string;
}): Promise<AgentTurnResult> {
  const { ctx } = opts;
  const messages = [...opts.messages];
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const client = new Anthropic();
  const toolDefs = anthropicToolDefs();

  // Resume path: the previous turn ended on a write awaiting confirmation. The
  // last assistant message holds the tool_use; execute or decline it here.
  if (opts.decision) {
    const resumed = await applyDecision(messages, opts.decision, ctx);
    if (resumed && resumed.type === "error") return resumed;
    // fall through into the loop to let the model continue after the tool_result
  }

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: systemPrompt(ctx, today),
        tools: toolDefs,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages,
      });

      if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
        messages.push({ role: "assistant", content: response.content });
        return { type: "message", text: textOf(response) || "(no reply)", messages };
      }

      if (response.stop_reason === "tool_use") {
        const toolUse = firstToolUse(response);
        if (!toolUse) {
          messages.push({ role: "assistant", content: response.content });
          return { type: "message", text: textOf(response) || "(no reply)", messages };
        }
        const tool = TOOLS_BY_NAME[toolUse.name];
        messages.push({ role: "assistant", content: response.content });

        // Unknown tool → feed an error back so the model can recover.
        if (!tool) {
          messages.push(toolResultMessage(toolUse.id, { ok: false, error: `Unknown tool ${toolUse.name}` }, true));
          continue;
        }

        const input = (toolUse.input ?? {}) as Record<string, unknown>;

        if (tool.mode === "write") {
          // Stop and ask the human. The pending tool_use lives in the last
          // assistant message; the client resends the transcript + a decision.
          return {
            type: "confirm",
            toolName: tool.name,
            summary: confirmSummaryFor(tool.name, input),
            pending: { id: toolUse.id, name: tool.name, input },
            messages,
          };
        }

        // Read tool → execute inline and continue the loop.
        const result = await safeRun(tool.name, input, ctx);
        messages.push(toolResultMessage(toolUse.id, result, !result.ok));
        continue;
      }

      // Any other stop reason: return what we have.
      messages.push({ role: "assistant", content: response.content });
      return { type: "message", text: textOf(response) || "(no reply)", messages };
    }

    return {
      type: "message",
      text: "I stopped after several steps to avoid looping. Tell me how you'd like to proceed.",
      messages,
    };
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `Anthropic API error (${err.status ?? "?"}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unexpected error running the assistant.";
    return { type: "error", error: msg, messages };
  }
}

/** Execute or decline the pending write held in the last assistant message. */
async function applyDecision(
  messages: Anthropic.MessageParam[],
  decision: Decision,
  ctx: AgentContext,
): Promise<AgentTurnResult | null> {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.content)) {
    return { type: "error", error: "No pending action to confirm.", messages };
  }
  const toolUse = last.content.find(
    (b): b is Anthropic.ToolUseBlock => typeof b === "object" && b.type === "tool_use",
  );
  if (!toolUse) return { type: "error", error: "No pending action to confirm.", messages };

  const tool = TOOLS_BY_NAME[toolUse.name];
  if (!tool || tool.mode !== "write") {
    return { type: "error", error: "Pending action is not a confirmable write.", messages };
  }

  if (decision === "reject") {
    messages.push(
      toolResultMessage(toolUse.id, { ok: false, error: "User declined this action." }, true),
    );
    return null;
  }

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const result = await safeRun(tool.name, input, ctx);
  messages.push(toolResultMessage(toolUse.id, result, !result.ok));
  return null;
}

async function safeRun(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ ok: boolean; [k: string]: unknown }> {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) return { ok: false, error: `Unknown tool ${name}` };
  try {
    return await tool.run(input, ctx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tool failed." };
  }
}

function toolResultMessage(
  toolUseId: string,
  result: unknown,
  isError: boolean,
): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: JSON.stringify(result),
        is_error: isError,
      },
    ],
  };
}

/** Tool names exposed, for the widget's capability hint. */
export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);
