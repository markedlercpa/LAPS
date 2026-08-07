import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agent/tools";

/**
 * Per-token identity for the Claude MCP connector. Each token is minted for one
 * LAPS user; the connector then acts as that user (ownership / send-as). Only
 * the SHA-256 hash is stored — the raw token is shown once at creation.
 */

const PREFIX = "laps_mcp_";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Resolve a presented bearer token to the mapped user's agent context. */
export async function resolveMcpToken(bearer: string | undefined | null): Promise<AgentContext | null> {
  const raw = bearer?.trim();
  if (!raw || !raw.startsWith(PREFIX)) return null;
  const token = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, role: true, name: true, email: true } } },
  });
  if (!token || token.revokedAt) return null;
  // Best-effort last-used stamp (don't block auth on it).
  void prisma.mcpToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return {
    userId: token.user.id,
    role: token.user.role,
    name: token.user.name,
    email: token.user.email,
  };
}

/**
 * Create a token for a user. Returns the raw token ONCE — it is not recoverable
 * afterward (only its hash is stored).
 */
export async function mintMcpToken(userId: string, name: string): Promise<{ id: string; token: string }> {
  const raw = PREFIX + randomBytes(32).toString("base64url");
  const created = await prisma.mcpToken.create({
    data: { name: name.trim() || "Claude connector", tokenHash: hashToken(raw), userId },
    select: { id: true },
  });
  return { id: created.id, token: raw };
}

/** Revoke a token (soft-delete via revokedAt). */
export async function revokeMcpToken(id: string): Promise<void> {
  await prisma.mcpToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** List a user's (or all) tokens for the admin UI — never returns the raw value. */
export async function listMcpTokens(userId?: string) {
  return prisma.mcpToken.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      user: { select: { name: true, email: true } },
    },
  });
}
