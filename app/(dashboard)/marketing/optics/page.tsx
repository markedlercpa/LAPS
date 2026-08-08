import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { SegToggle } from "@/components/ui/seg";
import { CalendarMonth, currentMonth, shiftMonth, type CalendarEvent } from "@/components/calendar-month";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { CONTENT_CHANNEL_LABELS } from "@/lib/echo-taxonomy";
import { NewMetric } from "@/components/echo/new-metric";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function OpticsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "overview";
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : currentMonth();
  const [snapshots, items] = await Promise.all([
    prisma.metricSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 300,
      include: { contentItem: { select: { id: true, title: true } } },
    }),
    prisma.contentItem.findMany({
      where: { status: { in: ["PUBLISHED", "SCHEDULED", "REVIEW", "DRAFT"] } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, title: true },
    }),
  ]);

  const totals = snapshots.reduce(
    (a, s) => ({
      impressions: a.impressions + s.impressions,
      engagements: a.engagements + s.engagements,
      clicks: a.clicks + s.clicks,
      conversions: a.conversions + s.conversions,
    }),
    { impressions: 0, engagements: 0, clicks: 0, conversions: 0 },
  );
  const resonance = totals.impressions > 0 ? totals.engagements / totals.impressions : 0;

  // Per-piece rollup for the resonance leaderboard.
  const byItem = new Map<
    string,
    { title: string; impressions: number; engagements: number; conversions: number }
  >();
  for (const s of snapshots) {
    if (!s.contentItem) continue;
    const cur = byItem.get(s.contentItem.id) ?? {
      title: s.contentItem.title,
      impressions: 0,
      engagements: 0,
      conversions: 0,
    };
    cur.impressions += s.impressions;
    cur.engagements += s.engagements;
    cur.conversions += s.conversions;
    byItem.set(s.contentItem.id, cur);
  }
  const leaderboard = [...byItem.entries()]
    .map(([id, v]) => ({ id, ...v, resonance: v.impressions > 0 ? v.engagements / v.impressions : 0 }))
    .sort((a, b) => b.resonance - a.resonance)
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        eyebrow="Marketing — Content Performance"
        title="Content Performance"
        description="How content performed once it ran. Numbers are aggregated manually — no analytics connector yet."
      >
        <NewMetric items={items} />
      </PageHeader>

      <div className="mb-6">
        <SegToggle
          param="view"
          defaultValue="overview"
          options={[
            { value: "overview", label: "Overview" },
            { value: "calendar", label: "Calendar" },
          ]}
        />
      </div>

      {view === "calendar" ? (
        <PerfCalendar
          month={month}
          events={snapshots
            .filter((s) => s.contentItem)
            .map((s) => ({
              dateISO: s.capturedAt.toISOString().slice(0, 10),
              label: `${s.contentItem!.title} · ${s.engagements.toLocaleString()} eng`,
              href: `/marketing/content/${s.contentItem!.id}`,
              tone: "ink" as const,
            }))}
        />
      ) : (
      <>
      <MetricRow
        metrics={[
          { label: "Impressions", value: totals.impressions.toLocaleString() },
          { label: "Engagements", value: totals.engagements.toLocaleString() },
          { label: "Resonance", value: pct(resonance) },
          { label: "Conversions", value: totals.conversions.toLocaleString() },
        ]}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Leaderboard */}
        <div>
          <div className="micro-label mb-2">Top resonance by piece</div>
          {leaderboard.length === 0 ? (
            <div className="border-2 border-divider bg-surface p-6 text-center text-muted">
              No content-tied snapshots yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Content</th>
                  <th className="num">Impr.</th>
                  <th className="num">Eng.</th>
                  <th className="num">Resonance</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/marketing/content/${r.id}`} className="text-accent-700 no-underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className="num">{r.impressions.toLocaleString()}</td>
                    <td className="num">{r.engagements.toLocaleString()}</td>
                    <td className="num font-heading font-extrabold">{pct(r.resonance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent snapshots */}
        <div>
          <div className="micro-label mb-2">Recent snapshots</div>
          {snapshots.length === 0 ? (
            <div className="border-2 border-divider bg-surface p-6 text-center text-muted">
              No snapshots yet. Add your first reading.
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.slice(0, 20).map((s) => (
                <div key={s.id} className="border border-divider bg-bg p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-medium">
                      {s.contentItem ? (
                        <Link href={`/marketing/content/${s.contentItem.id}`} className="text-accent-700 no-underline">
                          {s.contentItem.title}
                        </Link>
                      ) : (
                        <span className="text-muted">
                          {s.channel ? CONTENT_CHANNEL_LABELS[s.channel] : "General"}
                        </span>
                      )}
                    </div>
                    <span className="micro-label text-neutral-500">{formatDate(s.capturedAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted [font-variant-numeric:tabular-nums]">
                    <span>{s.impressions.toLocaleString()} impr.</span>
                    <span>{s.engagements.toLocaleString()} eng.</span>
                    <span>{s.clicks.toLocaleString()} clicks</span>
                    <span>{s.conversions.toLocaleString()} conv.</span>
                    {s.source && <span>· {s.source}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function PerfCalendar({ month, events }: { month: string; events: CalendarEvent[] }) {
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">Performance snapshots by capture date. Click a reading to open the piece.</p>
      <CalendarMonth
        month={month}
        events={events}
        prevHref={`?view=calendar&m=${shiftMonth(month, -1)}`}
        nextHref={`?view=calendar&m=${shiftMonth(month, 1)}`}
      />
    </div>
  );
}
