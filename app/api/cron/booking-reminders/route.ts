import { sendDueReminders } from "@/lib/booking";

export const dynamic = "force-dynamic";

/**
 * Cron endpoint — send reminder emails for upcoming bookings. Protect with
 * CRON_SECRET (bearer). Run it on a schedule (e.g. hourly) from Render Cron.
 * GET and POST both work so it's easy to trigger.
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : req.headers.get("x-cron-key") ?? "";
  if (token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const withinHours = Number(url.searchParams.get("withinHours") ?? "24");
  const sent = await sendDueReminders(Number.isFinite(withinHours) ? withinHours : 24);
  return Response.json({ ok: true, sent });
}

export const GET = handle;
export const POST = handle;
