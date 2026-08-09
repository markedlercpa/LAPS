"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { addPnlAdjustmentAction } from "@/app/(dashboard)/work/capacity/actions";

/** Manual P&L adjustment (write-off / correction). Positive adds to GP, negative reduces. */
export function AddAdjustmentButton({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addPnlAdjustmentAction({ portfolioId, amount: fd.get("amount"), memo: fd.get("memo") });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Adjustment
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="P&L adjustment">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Amount ($) — positive adds to GP, negative reduces</span>
            <input name="amount" type="number" step="0.01" className="input" required placeholder="-2500" />
          </label>
          <label className="field">
            <span className="micro-label">Memo</span>
            <input name="memo" className="input" required placeholder="Write-off — scope creep, client X" />
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Add"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
