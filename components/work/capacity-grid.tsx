"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import {
  requestBookingAction,
  confirmBookingAction,
  declineBookingAction,
  releaseBookingAction,
} from "@/app/(dashboard)/work/capacity/actions";
import type { GridResource, GridCell, GridBooking } from "@/lib/work/bookings";

type Props = {
  resources: GridResource[];
  weeks: string[];
  cells: Record<string, GridCell>;
  bookings: GridBooking[];
  closedWeeks: string[];
  engagements: { id: string; label: string }[];
};

function cellClasses(confirmed: number, capacity: number, closed: boolean): string {
  const util = capacity > 0 ? confirmed / capacity : 0;
  let bg = "bg-surface";
  if (util > 1) bg = "bg-accent text-bg";
  else if (util >= 0.75) bg = "bg-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]";
  else if (confirmed > 0) bg = "bg-[color:color-mix(in_srgb,var(--color-accent)_8%,transparent)]";
  return `${bg} ${closed ? "opacity-60" : ""}`;
}

function shortWeek(w: string): string {
  return w.replace(/^\d{4}-/, ""); // "W33"
}

export function CapacityGrid({ resources, weeks, cells, bookings, closedWeeks, engagements }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState<{ resourceId: string; isoWeek: string } | null>(null);
  const [band, setBand] = useState("");
  const [q, setQ] = useState("");

  const bands = useMemo(() => Array.from(new Set(resources.map((r) => r.band))).sort(), [resources]);
  const shown = useMemo(
    () =>
      resources.filter(
        (r) => (!band || r.band === band) && (!q || r.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [resources, band, q],
  );

  const selResource = resources.find((r) => r.id === sel?.resourceId) ?? null;
  const closedSet = useMemo(() => new Set(closedWeeks), [closedWeeks]);
  const selBookings = sel ? bookings.filter((b) => b.resourceId === sel.resourceId && b.isoWeek === sel.isoWeek) : [];
  const selClosed = sel ? closedSet.has(sel.isoWeek) : false;

  return (
    <>
      {resources.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-1.5">
            <span className="micro-label">Band</span>
            <select className="input py-1.5 text-[13px]" value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="">All</option>
              {bands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <input className="input w-[220px] py-1.5 text-[13px]" placeholder="Search resource…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="tag tag-neutral ml-auto">{shown.length} of {resources.length}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-bg px-3 py-2 text-left micro-label">Resource</th>
              {weeks.map((w) => (
                <th key={w} className="px-2 py-2 text-center micro-label">
                  {shortWeek(w)}
                  {closedSet.has(w) && <span className="ml-1 tag tag-neutral">closed</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-divider">
                <td className="sticky left-0 z-10 bg-bg px-3 py-2">
                  <div className="font-heading font-extrabold">{r.name}</div>
                  <div className="micro-label text-neutral-500">
                    {r.band} · {r.capacity}h{r.costExempt ? " · $0" : ""}
                  </div>
                </td>
                {weeks.map((w) => {
                  const c = cells[`${r.id}|${w}`] ?? { confirmed: 0, requested: 0, consumed: 0 };
                  return (
                    <td key={w} className="p-1 text-center">
                      <button
                        onClick={() => setSel({ resourceId: r.id, isoWeek: w })}
                        className={`w-full border-2 border-divider px-2 py-2 ${cellClasses(c.confirmed, r.capacity, closedSet.has(w))}`}
                        title="View / book"
                      >
                        <div className="font-heading font-extrabold">{c.confirmed}/{r.capacity}</div>
                        {c.requested > 0 && <div className="text-[10px]">+{c.requested} req</div>}
                        {c.consumed > 0 && <div className="text-[10px] opacity-70">{c.consumed} used</div>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {resources.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={weeks.length + 1}>
                No active resources yet — the grid fills in once you have pool members. Add them under{" "}
                <a className="text-accent-700" href="/work/capacity/resources">Resources</a> (or import your Karbon roster there).
                Then click any cell here to request, confirm, or release bookings.
              </td></tr>
            )}
            {resources.length > 0 && shown.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={weeks.length + 1}>No resources match the filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${selResource?.name} · ${sel.isoWeek}` : ""}>
        {sel && (
          <CellDrawer
            resourceId={sel.resourceId}
            isoWeek={sel.isoWeek}
            capacity={selResource?.capacity ?? 0}
            closed={selClosed}
            bookings={selBookings}
            engagements={engagements}
            onDone={() => router.refresh()}
          />
        )}
      </Modal>
    </>
  );
}

function CellDrawer({
  resourceId,
  isoWeek,
  capacity,
  closed,
  bookings,
  engagements,
  onDone,
}: {
  resourceId: string;
  isoWeek: string;
  capacity: number;
  closed: boolean;
  bookings: GridBooking[];
  engagements: { id: string; label: string }[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ack, setAck] = useState(false);

  function act(fn: () => Promise<{ ok: boolean; error?: string; note?: string; charged?: boolean }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg(res.error ?? "Failed");
      else {
        setMsg(res.charged ? "Past cutoff — released but still charges as booked-unused." : res.note ?? "Done.");
        onDone();
      }
    });
  }

  function request(fd: FormData) {
    act(() =>
      requestBookingAction({
        engagementId: fd.get("engagementId"),
        resourceId,
        isoWeek,
        hoursBooked: fd.get("hours"),
        overBudgetAck: ack,
      }),
    );
  }

  return (
    <div className="space-y-4">
      {closed && <p className="tag tag-accent inline-block">This week is closed — bookings are frozen.</p>}

      <div>
        <div className="micro-label mb-2">Bookings this week</div>
        {bookings.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing booked yet.</p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 border-2 border-divider p-2 text-[13px]">
                <div className="min-w-0">
                  <div className="font-heading font-extrabold truncate">{b.engagement}</div>
                  <div className="text-muted">
                    {b.portfolio} · {b.hoursBooked}h booked{b.hoursConsumed > 0 ? ` · ${b.hoursConsumed}h used` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`tag ${b.status === "CONFIRMED" ? "tag-accent" : b.status === "REQUESTED" ? "tag-outline" : "tag-neutral"}`}>
                    {b.status.toLowerCase().replace("_", " ")}
                  </span>
                  {!closed && b.status === "REQUESTED" && (
                    <>
                      <button className="btn btn-secondary btn-icon" disabled={pending} onClick={() => act(() => confirmBookingAction(b.id))} title="Confirm">✓</button>
                      <button className="btn btn-ghost btn-icon" disabled={pending} onClick={() => act(() => declineBookingAction(b.id))} title="Decline">✕</button>
                    </>
                  )}
                  {!closed && b.status === "CONFIRMED" && (
                    <button className="btn btn-ghost btn-icon" disabled={pending} onClick={() => act(() => releaseBookingAction(b.id))} title="Release">↩</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!closed && (
        <form action={request} className="space-y-2 border-t-2 border-divider pt-3">
          <div className="micro-label">Request a booking ({capacity}h capacity)</div>
          <label className="field">
            <span className="micro-label">Engagement</span>
            <select name="engagementId" className="input" required>
              {engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Hours</span>
            <input name="hours" type="number" min="0.5" max="80" step="0.5" className="input w-28 text-right" required />
          </label>
          <label className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Acknowledge over-budget (allow the overrun)
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending || engagements.length === 0}>
            {pending ? "Working…" : "Request booking"}
          </button>
        </form>
      )}

      {msg && <p className="text-[13px] text-accent-700">{msg}</p>}
    </div>
  );
}
