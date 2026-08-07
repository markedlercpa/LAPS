import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { LogTimeForm } from "@/components/work/log-time";
import { DeleteTimeEntryButton } from "@/components/work/delete-time-entry";
import { listTimeEntries } from "@/lib/work/time";

export const dynamic = "force-dynamic";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ resource?: string; engagement?: string; week?: string }>;
}) {
  const sp = await searchParams;

  const [resources, engagements, entries] = await Promise.all([
    prisma.poolResource.findMany({ where: { active: true }, orderBy: { personName: "asc" }, select: { id: true, personName: true } }),
    prisma.portfolioEngagement.findMany({
      orderBy: { clientName: "asc" },
      select: { id: true, clientName: true, portfolio: { select: { name: true } } },
    }),
    listTimeEntries({ resourceId: sp.resource, engagementId: sp.engagement, isoWeek: sp.week, limit: 300 }),
  ]);

  const engagementOptions = engagements.map((e) => ({ id: e.id, label: `${e.clientName} · ${e.portfolio.name}` }));

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Time"
        description="Pulse's native timesheet — the actuals source for the Capacity module. Logged hours roll up into each engagement's consumed hours and cost."
      />

      <div className="mb-5">
        <LogTimeForm
          resources={resources.map((r) => ({ id: r.id, name: r.personName }))}
          engagements={engagementOptions}
          defaultEngagementId={sp.engagement}
        />
      </div>

      {/* Filters */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="field">
          <span className="micro-label">Person</span>
          <select name="resource" defaultValue={sp.resource ?? ""} className="input">
            <option value="">All</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.personName}</option>)}
          </select>
        </label>
        <label className="field min-w-[220px]">
          <span className="micro-label">Engagement</span>
          <select name="engagement" defaultValue={sp.engagement ?? ""} className="input">
            <option value="">All</option>
            {engagementOptions.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="micro-label">ISO week</span>
          <input name="week" defaultValue={sp.week ?? ""} className="input w-32" placeholder="2026-W33" />
        </label>
        <button className="btn btn-secondary" type="submit">Filter</button>
        <span className="tag tag-neutral ml-auto">{entries.totalHours} h total</span>
      </form>

      {entries.rows.length === 0 ? (
        <p className="text-[14px] text-muted">No time logged for this selection yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Week</th>
              <th>Person</th>
              <th>Engagement</th>
              <th>Notes</th>
              <th className="num">Hours</th>
              <th>Billable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.workDate}</td>
                <td className="text-muted">{r.isoWeek}</td>
                <td>{r.resource}</td>
                <td className="text-muted">{r.engagement} · {r.portfolio}</td>
                <td className="text-muted">{r.notes ?? ""}</td>
                <td className="num">{r.hours}</td>
                <td>{r.billable ? "Yes" : <span className="text-muted">No</span>}</td>
                <td className="text-right"><DeleteTimeEntryButton id={r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
