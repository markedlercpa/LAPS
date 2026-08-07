import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { listBannedPhrases } from "@/lib/echo";
import { ContentEditor } from "@/components/echo/content-editor";

export const dynamic = "force-dynamic";

export default async function ContentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const item = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      evidence: { select: { id: true, type: true, distilled: true, rawText: true } },
      cards: { select: { id: true, cardText: true, category: true } },
      module: { select: { id: true, name: true } },
      sourceItem: { select: { id: true, title: true } },
      derivatives: { select: { id: true, title: true, channel: true } },
    },
  });
  if (!item) notFound();

  const [allEvidence, allCards, modules, banned] = await Promise.all([
    prisma.evidenceRecord.findMany({
      orderBy: [{ strength: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, type: true, distilled: true, rawText: true },
    }),
    prisma.callingCard.findMany({
      where: { status: { not: "RETIRED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, cardText: true, category: true },
    }),
    prisma.contentModule.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listBannedPhrases(),
  ]);

  return (
    <div>
      <Link href="/marketing/content" className="btn btn-ghost mb-4 -ml-1">
        <ArrowLeft className="h-4 w-4" />
        Back to content
      </Link>

      <ContentEditor
        item={{
          id: item.id,
          title: item.title,
          channel: item.channel,
          status: item.status,
          summary: item.summary,
          body: item.body,
          pillarTags: item.pillarTags,
          moduleId: item.moduleId,
          publishedUrl: item.publishedUrl,
          publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        }}
        linkedEvidence={item.evidence.map((e) => ({
          id: e.id,
          label: e.distilled || e.rawText.slice(0, 120),
          type: e.type,
        }))}
        linkedCards={item.cards.map((c) => ({ id: c.id, text: c.cardText, category: c.category }))}
        allEvidence={allEvidence.map((e) => ({
          id: e.id,
          label: e.distilled || e.rawText.slice(0, 120),
          type: e.type,
        }))}
        allCards={allCards.map((c) => ({ id: c.id, text: c.cardText, category: c.category }))}
        modules={modules}
        source={item.sourceItem}
        derivatives={item.derivatives}
        bannedPhrases={banned.map((b) => b.phrase)}
      />
    </div>
  );
}
