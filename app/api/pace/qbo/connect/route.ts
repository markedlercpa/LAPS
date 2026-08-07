import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { authorizeUrl, qboConfigured } from "@/lib/pace/qbo";

/**
 * QBO connect / reconnect entry point (the "Connect/Reconnect URL" for the
 * Intuit app profile). A human in a browser lands here:
 *  - not signed in → /signin
 *  - QBO not configured → back to entities with a notice
 *  - ?entity=<id> given → straight to the Intuit authorize screen
 *  - otherwise → the entities page to pick which company to link
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (!qboConfigured()) redirect("/finance/entities?qbo=unconfigured");

  const entityId = new URL(req.url).searchParams.get("entity");
  if (entityId) {
    const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
    const url = entity ? await authorizeUrl(entity.id) : null;
    if (url) redirect(url);
  }
  redirect("/finance/entities?qbo=connect");
}
