"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createEngagementAction } from "@/app/(dashboard)/work/capacity/actions";
import {
  ENGAGEMENT_TYPES,
  ENGAGEMENT_TYPE_LABELS,
  REVENUE_RECOGNITION,
  REVENUE_RECOGNITION_LABELS,
} from "@/lib/work-taxonomy";

export function NewEngagementButton({ portfolios }: { portfolios: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createEngagementAction({
        portfolioId: fd.get("portfolioId"),
        clientName: fd.get("clientName"),
        engagementType: fd.get("engagementType"),
        revenue: fd.get("revenue"),
        revenueRecognition: fd.get("revenueRecognition"),
        karbonWorkItemKey: fd.get("karbonWorkItemKey") || undefined,
      });
      if (res.ok) {
        setOpen(false);
        router.push(`/work/capacity/engagements/${res.id}`);
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={portfolios.length === 0}>
        <Plus className="h-4 w-4" /> New engagement
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New engagement">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Portfolio</span>
            <select name="portfolioId" className="input" required>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Client</span>
            <input name="clientName" className="input" required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Type</span>
              <select name="engagementType" className="input" defaultValue="other">
                {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{ENGAGEMENT_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Revenue ($)</span>
              <input name="revenue" type="number" min="0" step="500" className="input" defaultValue={0} />
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Revenue recognition</span>
            <select name="revenueRecognition" className="input" defaultValue="fixed_on_completion">
              {REVENUE_RECOGNITION.map((r) => <option key={r} value={r}>{REVENUE_RECOGNITION_LABELS[r]}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Karbon work-item key (optional)</span>
            <input name="karbonWorkItemKey" className="input" placeholder="for actuals sync" />
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
