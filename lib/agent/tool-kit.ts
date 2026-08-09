import type Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

/**
 * Shared types + helpers for the agent tool registry. Lives apart from
 * tools.ts so per-module tool files can import the type/helpers without a
 * circular dependency on the registry itself.
 */

export type AgentContext = {
  userId: string;
  role?: string;
  name?: string | null;
  email?: string | null;
};

export type ToolResult = { ok: boolean; [k: string]: unknown };

export type AgentTool = {
  name: string;
  description: string;
  mode: "read" | "write";
  input_schema: Anthropic.Tool.InputSchema;
  /** Human-readable one-liner shown on the confirmation card (writes only). */
  confirmSummary?: (input: Record<string, unknown>) => string;
  run: (input: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
};

/**
 * Best-effort cache revalidation. `revalidatePath` throws outside a Next request
 * store (the MCP route's tool-execution context, or a script), and refreshing a
 * page cache must never fail a data write — so swallow that error.
 */
export function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    /* no request store — the write already succeeded */
  }
}

export function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function num(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
