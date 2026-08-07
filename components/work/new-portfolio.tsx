"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createPortfolioAction } from "@/app/(dashboard)/work/capacity/actions";

export function NewPortfolioButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createPortfolioAction({
        name: fd.get("name"),
        directorName: fd.get("directorName"),
        directorEmail: fd.get("directorEmail"),
        directorCostAnnual: fd.get("directorCostAnnual"),
        declaredRevenue: fd.get("declaredRevenue"),
        gpTargetPct: fd.get("gpTargetPct"),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New portfolio
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New portfolio">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Portfolio name</span>
            <input name="name" className="input" required placeholder="Sammy — QofE & CAS Book 1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Director name</span>
              <input name="directorName" className="input" required />
            </label>
            <label className="field">
              <span className="micro-label">Director email</span>
              <input name="directorEmail" type="email" className="input" required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Director cost / yr ($)</span>
              <input name="directorCostAnnual" type="number" min="0" step="1000" className="input" defaultValue={0} />
            </label>
            <label className="field">
              <span className="micro-label">Declared revenue ($)</span>
              <input name="declaredRevenue" type="number" min="0" step="1000" className="input" defaultValue={0} />
            </label>
          </div>
          <label className="field">
            <span className="micro-label">GP target (0–1)</span>
            <input name="gpTargetPct" type="number" min="0" max="1" step="0.05" className="input" defaultValue={0.5} />
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
