import { prisma } from "@/lib/prisma";
import { qboConfigured } from "@/lib/pace/qbo";
import { syncEntityActuals } from "@/lib/pace/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly Finance sync — incremental QBO pull for every connected entity via the
 * shared `syncEntityActuals` (ChangeDataCapture: only the months whose
 * transactions changed since the last sync, plus the current month; full
 * backfill on the first run or after the CDC window lapses). CRON_SECRET-guarded
 * (same convention as booking-reminders). No-op (ok:true, synced:0) when QBO is
 * unconfigured or no entity is connected, so the job is safe to schedule before
 * QBO is wired.
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

  let synced = 0;
  let glLines = 0;
  const errors: string[] = [];
  for (const c of connected) {
    try {
      const res = await syncEntityActuals(c.entityId);
      if (res.ok) {
        synced += res.imported;
        glLines += res.glLines;
      } else {
        errors.push(`${c.entityId}: ${res.error}`);
      }
    } catch (err) {
      errors.push(`${c.entityId}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return Response.json({ ok: true, synced, glLines, entities: connected.length, errors });
}

export const GET = handle;
export const POST = handle;
