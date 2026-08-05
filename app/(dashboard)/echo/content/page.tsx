import Link from "next/link";
import type { Prisma, ContentChannel, ContentStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import {
  CONTENT_CHANNELS,
  CONTENT_CHANNEL_LABELS,
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TAG,
  PILLAR_LABELS,
} from "@/lib/echo-taxonomy";
import { NewContent } from "@/components/echo/new-content";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const channel = CONTENT_CHANNELS.includes(sp.channel as ContentChannel)
    ? (sp.channel as ContentChannel)
    : undefined;
  const status = CONTENT_STATUSES.includes(sp.status as ContentStatus)
    ? (sp.status as ContentStatus)
    : undefined;

  const where: Prisma.ContentItemWhereInput = {
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
  };

  const items = await prisma.contentItem.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: {
      _count: { select: { evidence: true, cards: true } },
      module: { select: { name: true } },
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="ECHO — Housed Content"
        title="Content builder"
        description="Every piece is built here and traces back to evidence. Repurpose across channels without losing the thread."
      >
        <NewContent />
      </PageHeader>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap items-end gap-2" method="get">
        <div className="field">
          <label>Channel</label>
          <select name="channel" className="input" defaultValue={channel ?? ""}>
            <option value="">All channels</option>
            {CONTENT_CHANNELS.map((c) => (
              <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select name="status" className="input" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {CONTENT_STATUSES.map((s) => (
              <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>

      {items.length === 0 ? (
        <div className="border-2 border-divider bg-surface p-8 text-center text-muted">
          No content yet. Start a piece — it&apos;ll trace back to your evidence.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/echo/content/${it.id}`}
              className="flex items-start justify-between gap-3 border border-divider bg-bg p-4 no-underline hover:bg-surface"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`tag ${CONTENT_STATUS_TAG[it.status]}`}>
                    {CONTENT_STATUS_LABELS[it.status]}
                  </span>
                  <span className="tag tag-outline">{CONTENT_CHANNEL_LABELS[it.channel]}</span>
                  {it.module && <span className="micro-label">{it.module.name}</span>}
                </div>
                <div className="mt-1 font-heading text-[17px] font-extrabold text-ink">
                  {it.title}
                </div>
                {it.summary && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{it.summary}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {it.pillarTags.map((p) => (
                    <span key={p} className="tag tag-outline text-[11px]">{PILLAR_LABELS[p]}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="micro-label text-neutral-500">
                  {it._count.evidence} evidence · {it._count.cards} cards
                </div>
                <div className="micro-label mt-1 text-neutral-500">{formatDate(it.updatedAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
