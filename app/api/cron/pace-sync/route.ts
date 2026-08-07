import { prisma } from "@/lib/prisma";
import { qboConfigured, pullTrialBalance } from "@/lib/pace/qbo";
import { importTrialBalance } from "@/lib/pace/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly PACE sync — pull the current + prior month trial balance from QBO for
 * every connected entity. CRON_SECRET-guarded (same convention as
 * booking-reminders). No-op (ok:true, synced:0) when QBO is unconfigured or no
 * entity is connected, so the job is safe to schedule before QBO is wired.
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : req.headers.get("x-cron-key") ?? "";
  if (token !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!qboConfigured()) return Response.json({ ok: true, synced: 0, note: "QBO not configured" });

  const connected = await prisma.ledgerConnection.findMany({
    where: { provider: "QBO", status: "connected" },
    select: { entityId: true },
  });

  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const priorMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const months = [priorMonth, thisMonth].map((d) => d.toISOString().slice(0, 10));

  let synced = 0;
  const errors: string[] = [];
  for (const c of connected) {
    for (const month of months) {
      try {
        const rows = await pullTrialBalance(c.entityId, month);
        if (!rows) continue;
        await importTrialBalance({ entityId: c.entityId, periodMonth: month, rows, source: "qbo" });
        synced += 1;
      } catch (err) {
        errors.push(`${c.entityId}/${month}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }
  return Response.json({ ok: true, synced, entities: connected.length, errors });
}

export const GET = handle;
export const POST = handle;
