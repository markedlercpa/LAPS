import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { exchangeCode, qboConfigured } from "@/lib/pace/qbo";

/**
 * Intuit OAuth redirect target. Intuit sends `code`, `state` (our entityId), and
 * `realmId` (the QBO company). We exchange the code for tokens, persist them on
 * the entity's LedgerConnection, and bounce back to the entities page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (!qboConfigured()) redirect("/pace/entities?qbo=unconfigured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const entityId = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");

  if (!code || !entityId || !realmId) redirect("/pace/entities?qbo=error");

  const ok = await exchangeCode(entityId, code, realmId);
  redirect(`/pace/entities?qbo=${ok ? "connected" : "error"}`);
}
