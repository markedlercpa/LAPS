"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { requestBookingAction } from "@/app/(dashboard)/work/capacity/actions";

/** Create a booking request directly from the queue (no need to open the grid). */
export function NewBookingRequestButton({
  resources,
  engagements,
  weeks,
}: {
  resources: { id: string; name: string }[];
  engagements: { id: string; label: string }[];
  weeks: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await requestBookingAction({
        engagementId: fd.get("engagementId"),
        resourceId: fd.get("resourceId"),
        isoWeek: fd.get("isoWeek"),
        hoursBooked: fd.get("hours"),
        overBudgetAck: ack,
      });
      if (res.ok) {
        setOpen(false);
        setAck(false);
        router.refresh();
      } else setError(res.error ?? "Failed");
    });
  }

  const disabled = resources.length === 0 || engagements.length === 0;

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Add resources and engagements first" : undefined}>
        <Plus className="h-4 w-4" /> New request
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New booking request">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Resource</span>
            <select name="resourceId" className="input" required>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Engagement</span>
            <select name="engagementId" className="input" required>
              {engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">ISO week</span>
              <select name="isoWeek" className="input" required>
                {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Hours</span>
              <input name="hours" type="number" min="0.5" max="80" step="0.5" className="input" required />
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Acknowledge over-budget (allow the overrun)
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Requesting…" : "Request booking"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
