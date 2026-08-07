import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * QBO disconnect endpoint (the "Disconnect URL" for the Intuit app profile).
 * Intuit sends the user's browser here when they disconnect the app from within
 * QuickBooks. We clear the stored tokens for the matching connection (by
 * realmId when Intuit includes it, or by ?entity=<id>) and land back on the
 * entities page. Safe to hit without a matching connection — it just returns.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const params = new URL(req.url).searchParams;
  const realmId = params.get("realmId");
  const entityId = params.get("entity");

  const where = realmId
    ? { realmId }
    : entityId
      ? { entityId }
      : null;

  if (where) {
    await prisma.ledgerConnection.updateMany({
      where: { ...where, provider: "QBO" },
      data: { status: "disconnected", accessToken: null, refreshToken: null, expiresAt: null },
    });
  }
  redirect("/pace/entities?qbo=disconnected");
}

export const POST = GET;
