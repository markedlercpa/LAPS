import { karbonConfigured, syncKarbonActuals } from "@/lib/work/karbon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly Karbon actuals sync for the Capacity module. CRON_SECRET-guarded
 * (same convention as booking-reminders / pace-sync). No-op when Karbon is
 * unconfigured, so the job is safe to schedule before creds are wired.
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : req.headers.get("x-cron-key") ?? "";
  if (token !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!karbonConfigured()) return Response.json({ ok: true, note: "Karbon not configured" });

  const res = await syncKarbonActuals();
  return Response.json(res);
}

export const GET = handle;
export const POST = handle;
