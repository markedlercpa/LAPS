"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { mintMcpToken, revokeMcpToken } from "@/lib/agent/mcp-auth";

const schema = z.object({
  rows: z.array(
    z.object({
      level: z.enum(["ASSOCIATE", "SENIOR", "MANAGER", "DIRECTOR", "PARTNER"]),
      cost: z.coerce.number().min(0),
      bill: z.coerce.number().min(0),
    }),
  ),
});

/** Update the firm-wide standard rate card (cost + billing rate per level). */
export async function updateRateCard(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid rates" };
  for (let i = 0; i < parsed.data.rows.length; i++) {
    const r = parsed.data.rows[i];
    await prisma.rateCardLevel.upsert({
      where: { level: r.level },
      update: { cost: r.cost, bill: r.bill, sortOrder: i },
      create: { level: r.level, cost: r.cost, bill: r.bill, sortOrder: i },
    });
  }
  revalidatePath("/settings");
  return { ok: true as const };
}

// ── Claude connector (MCP) tokens ─────────────────────────────────────────────

async function requireAdmin(): Promise<{ id: string; role?: string } | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || (user as { role?: string }).role !== "ADMIN") return null;
  return { id: user.id, role: (user as { role?: string }).role };
}

/**
 * Mint a connector token. Acts as the signed-in admin by default (per-token →
 * user mapping). Returns the raw token ONCE — it is not recoverable afterward.
 */
export async function createConnectorToken(input: unknown) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Admins only." };
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Give the token a name." };
  const { id, token } = await mintMcpToken(admin.id, parsed.data.name);
  revalidatePath("/settings");
  return { ok: true as const, id, token };
}

export async function revokeConnectorToken(id: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Admins only." };
  await revokeMcpToken(id);
  revalidatePath("/settings");
  return { ok: true as const };
}
