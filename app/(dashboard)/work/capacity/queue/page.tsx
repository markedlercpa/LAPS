import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { QueueActions } from "@/components/work/queue-actions";
import { NewBookingRequestButton } from "@/components/work/new-booking-request";
import { pendingRequests } from "@/lib/work/bookings";
import { upcomingWeeks } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function BookingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ resource?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const [all, resources, engagements] = await Promise.all([
    pendingRequests(),
    prisma.poolResource.findMany({ where: { active: true }, orderBy: { personName: "asc" }, select: { id: true, personName: true } }),
    prisma.portfolioEngagement.findMany({
      where: { status: { not: "complete" } },
      orderBy: { clientName: "asc" },
      select: { id: true, clientName: true, portfolio: { select: { name: true } } },
    }),
  ]);

  const requests = all.filter(
    (r) => (!sp.resource || r.resource === sp.resource) && (!sp.week || r.isoWeek === sp.week),
  );
  const resourceNames = Array.from(new Set(all.map((r) => r.resource))).sort();
  const weekOptions = Array.from(new Set(all.map((r) => r.isoWeek))).sort();

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Booking queue"
        description="Requests awaiting broker confirmation. Confirm snapshots the charge rate and holds capacity; overbook warnings flag requests that would exceed a resource's week."
      >
        <NewBookingRequestButton
          resources={resources.map((r) => ({ id: r.id, name: r.personName }))}
          engagements={engagements.map((e) => ({ id: e.id, label: `${e.clientName} · ${e.portfolio.name}` }))}
          weeks={upcomingWeeks(8)}
        />
        <Link href="/work/capacity/grid" className="btn btn-secondary">Capacity grid</Link>
      </PageHeader>

      {all.length > 0 && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="field">
            <span className="micro-label">Resource</span>
            <select name="resource" defaultValue={sp.resource ?? ""} className="input">
              <option value="">All</option>
              {resourceNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Week</span>
            <select name="week" defaultValue={sp.week ?? ""} className="input">
              <option value="">All</option>
              {weekOptions.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">Filter</button>
        </form>
      )}

      {requests.length === 0 ? (
        <p className="text-[14px] text-muted">Queue is clear — no pending requests.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Week</th>
              <th>Engagement</th>
              <th>Band</th>
              <th className="num">Hours</th>
              <th>Flags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="font-heading font-extrabold">{r.resource}</td>
                <td>{r.isoWeek}</td>
                <td className="text-muted">{r.engagement} · {r.portfolio}</td>
                <td>{r.band}</td>
                <td className="num">{r.hours}</td>
                <td>
                  {r.wouldOverbook && (
                    <span className="tag tag-accent" title={`${r.confirmed}h confirmed of ${r.capacity}h`}>overbooks</span>
                  )}
                  {r.overBudgetAck && <span className="tag tag-outline ml-1">over budget</span>}
                  {!r.wouldOverbook && !r.overBudgetAck && <span className="text-muted">—</span>}
                </td>
                <td><QueueActions id={r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
