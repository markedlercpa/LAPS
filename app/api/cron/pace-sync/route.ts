import { prisma } from "@/lib/prisma";
import { qboConfigured, pullTrialBalance, pullGeneralLedger, syncLedgerAccounts } from "@/lib/pace/qbo";
import { importTrialBalance } from "@/lib/pace/import";
import { importGeneralLedger } from "@/lib/pace/gl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly Finance sync — pull the current + prior month trial balance from QBO for
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
  let glLines = 0;
  const errors: string[] = [];
  for (const c of connected) {
    // Refresh the chart of accounts (numbers + QBO descriptive metadata) once per entity.
    await syncLedgerAccounts(c.entityId).catch(() => null);
    for (const month of months) {
      try {
        const rows = await pullTrialBalance(c.entityId, month);
        if (!rows) continue;
        await importTrialBalance({ entityId: c.entityId, periodMonth: month, rows, source: "qbo" });
        synced += 1;

        const start = new Date(month);
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
        const gl = await pullGeneralLedger(c.entityId, month, end).catch(() => null);
        if (gl && gl.length) {
          const res = await importGeneralLedger({ entityId: c.entityId, periodMonthISO: month, lines: gl }).catch(() => null);
          if (res) glLines += res.count;
        }
      } catch (err) {
        errors.push(`${c.entityId}/${month}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }
  return Response.json({ ok: true, synced, glLines, entities: connected.length, errors });
}

export const GET = handle;
export const POST = handle;
