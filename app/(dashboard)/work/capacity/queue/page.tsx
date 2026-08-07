import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QueueActions } from "@/components/work/queue-actions";
import { pendingRequests } from "@/lib/work/bookings";

export const dynamic = "force-dynamic";

export default async function BookingQueuePage() {
  const requests = await pendingRequests();

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Booking queue"
        description="Requests awaiting broker confirmation. Confirm snapshots the charge rate and holds capacity; overbook warnings flag requests that would exceed a resource's week."
      >
        <Link href="/work/capacity/grid" className="btn btn-secondary">Capacity grid</Link>
      </PageHeader>

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
