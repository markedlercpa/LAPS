"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { addRoleBandRateAction } from "@/app/(dashboard)/work/capacity/actions";

/** Add a new effective-dated loaded/bill rate for a role band. */
export function AddRateButton({ band }: { band: { id: string; name: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addRoleBandRateAction({
        roleBandId: band.id,
        loadedRate: fd.get("loadedRate"),
        billRate: fd.get("billRate") || undefined,
        effectiveFrom: fd.get("effectiveFrom"),
        note: fd.get("note") || undefined,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-secondary btn-icon" onClick={() => setOpen(true)} title={`New rate for ${band.name}`} aria-label="Add rate">
        <Plus className="h-4 w-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`New rate — ${band.name}`}>
        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Loaded rate ($/hr)</span>
              <input name="loadedRate" type="number" min="0" step="1" className="input" required />
            </label>
            <label className="field">
              <span className="micro-label">Bill rate ($/hr, optional)</span>
              <input name="billRate" type="number" min="0" step="1" className="input" />
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Effective from</span>
            <input name="effectiveFrom" type="date" className="input" required />
          </label>
          <label className="field">
            <span className="micro-label">Derivation note (optional, for audit)</span>
            <textarea name="note" className="input" rows={2} placeholder="salary + benefits + taxes + tooling ÷ (cap × 46 × util)" />
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Add rate"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
