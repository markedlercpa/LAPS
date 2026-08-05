import { NextResponse } from "next/server";
import { join } from "path";
import { runHubspotImport } from "@/lib/hubspot-import";

// One-time HubSpot data load. Secured by a shared secret (IMPORT_SECRET).
// Reads the committed export from ./hubspot-export and upserts into the DB.
// Remove this route (and the data) once the load is done.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.IMPORT_SECRET;
  const key = new URL(request.url).searchParams.get("key");

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "IMPORT_SECRET is not set on the server." },
      { status: 500 },
    );
  }
  if (key !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const counts = await runHubspotImport(join(process.cwd(), "hubspot-export"));
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    console.error("HubSpot import failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 },
    );
  }
}
