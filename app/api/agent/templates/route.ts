import { requireAgent, json } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { ensureProposalTemplatesSeeded } from "@/lib/proposal-templates";

export const dynamic = "force-dynamic";

/** GET /api/agent/templates — list full proposal templates + section snippets. */
export async function GET(req: Request) {
  const err = requireAgent(req);
  if (err) return err;

  await ensureProposalTemplatesSeeded();
  const [templates, snippets] = await Promise.all([
    prisma.proposalTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.sectionSnippet.findMany({
      orderBy: { sortOrder: "asc" },
      select: { key: true, type: true, name: true, body: true },
    }),
  ]);
  return json({ templates, snippets });
}
