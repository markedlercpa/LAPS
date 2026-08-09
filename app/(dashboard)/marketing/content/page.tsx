import Link from "next/link";
import type { Prisma, ContentChannel, ContentStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SegToggle } from "@/components/ui/seg";
import { CalendarMonth, currentMonth, shiftMonth, type CalendarEvent } from "@/components/calendar-month";
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
  searchParams: Promise<{ channel?: string; status?: string; view?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "board" || sp.view === "calendar" ? sp.view : "list";
  const channel = CONTENT_CHANNELS.includes(sp.channel as ContentChannel) ? (sp.channel as ContentChannel) : undefined;
  const status = CONTENT_STATUSES.includes(sp.status as ContentStatus) ? (sp.status as ContentStatus) : undefined;

  // Kanban + calendar need the whole set; only the list view honors the status filter.
  const where: Prisma.ContentItemWhereInput = {
    ...(channel ? { channel } : {}),
    ...(status && view === "list" ? { status } : {}),
  };

  const items = await prisma.contentItem.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    include: { _count: { select: { evidence: true, cards: true } }, module: { select: { name: true } } },
  });

  const viewToggle = (
    <SegToggle
      param="view"
      defaultValue="list"
      options={[
        { value: "list", label: "List" },
        { value: "board", label: "Kanban" },
        { value: "calendar", label: "Calendar" },
      ]}
    />
  );

  return (
    <div>
      <PageHeader
        eyebrow="Marketing — Content Builder"
        title="Content Builder"
        description="Every piece is built here and traces back to evidence. Repurpose across channels, move it through the pipeline, and schedule publishing."
      >
        <NewContent />
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        {viewToggle}
        {view !== "calendar" && (
          <form className="flex flex-wrap items-end gap-2" method="get">
            <input type="hidden" name="view" value={view} />
            <div className="field">
              <label>Channel</label>
              <select name="channel" className="input" defaultValue={channel ?? ""}>
                <option value="">All channels</option>
                {CONTENT_CHANNELS.map((c) => <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>)}
              </select>
            </div>
            {view === "list" && (
              <div className="field">
                <label>Status</label>
                <select name="status" className="input" defaultValue={status ?? ""}>
                  <option value="">All statuses</option>
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-secondary" type="submit">Filter</button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="border-2 border-divider bg-surface p-8 text-center text-muted">
          No content yet. Start a piece — it&apos;ll trace back to your evidence.
        </div>
      ) : view === "board" ? (
        <Kanban items={items} />
      ) : view === "calendar" ? (
        <CalendarView items={items} month={/^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : currentMonth()} />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/marketing/content/${it.id}`}
              className="flex items-start justify-between gap-3 border border-divider bg-bg p-4 no-underline hover:bg-surface"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`tag ${CONTENT_STATUS_TAG[it.status]}`}>{CONTENT_STATUS_LABELS[it.status]}</span>
                  <span className="tag tag-outline">{CONTENT_CHANNEL_LABELS[it.channel]}</span>
                  {it.module && <span className="micro-label">{it.module.name}</span>}
                  {it.scheduledFor && <span className="micro-label text-neutral-500">→ {formatDate(it.scheduledFor)}</span>}
                </div>
                <div className="mt-1 font-heading text-[17px] font-extrabold text-ink">{it.title}</div>
                {it.summary && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{it.summary}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {it.pillarTags.map((p) => <span key={p} className="tag tag-outline text-[11px]">{PILLAR_LABELS[p]}</span>)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="micro-label text-neutral-500">{it._count.evidence} evidence · {it._count.cards} cards</div>
                <div className="micro-label mt-1 text-neutral-500">{formatDate(it.updatedAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type Item = {
  id: string;
  title: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
};

function Kanban({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-1">
      {CONTENT_STATUSES.map((s) => {
        const col = items.filter((it) => it.status === s);
        return (
          <div key={s} className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <span className={`tag ${CONTENT_STATUS_TAG[s]}`}>{CONTENT_STATUS_LABELS[s]}</span>
              <span className="micro-label text-neutral-500">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((it) => (
                <Link key={it.id} href={`/marketing/content/${it.id}`} className="block border border-divider bg-bg p-2.5 no-underline hover:bg-surface">
                  <div className="text-[13px] font-heading font-extrabold text-ink line-clamp-2">{it.title}</div>
                  <div className="mt-1 text-[11px] text-muted">{CONTENT_CHANNEL_LABELS[it.channel]}</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ items, month }: { items: Item[]; month: string }) {
  const events: CalendarEvent[] = items
    .map((it): CalendarEvent | null => {
      const when = it.publishedAt ?? it.scheduledFor;
      if (!when) return null;
      return {
        dateISO: when.toISOString().slice(0, 10),
        label: it.title,
        href: `/marketing/content/${it.id}`,
        tone: it.publishedAt ? "accent" : "ink",
      };
    })
    .filter((e): e is CalendarEvent => e !== null);

  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        Publishing schedule — <span className="text-ink">solid</span> = published, <span className="text-ink">outline</span> = scheduled. Set a date on a piece to place it here.
      </p>
      <CalendarMonth
        month={month}
        events={events}
        prevHref={`?view=calendar&m=${shiftMonth(month, -1)}`}
        nextHref={`?view=calendar&m=${shiftMonth(month, 1)}`}
      />
    </div>
  );
}
