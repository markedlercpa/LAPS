import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { exchangeCode, qboConfigured, verifyState } from "@/lib/pace/qbo";

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
  if (!qboConfigured()) redirect("/finance/entities?qbo=unconfigured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  // Verify the signed, time-boxed state (CSRF protection) → entityId.
  const entityId = verifyState(url.searchParams.get("state"));

  if (!code || !entityId || !realmId) redirect("/finance/entities?qbo=error");

  const ok = await exchangeCode(entityId, code, realmId);
  redirect(`/finance/entities?qbo=${ok ? "connected" : "error"}`);
}
