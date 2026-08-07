"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { importTrialBalanceAction } from "@/app/(dashboard)/pace/actions";

/** Paste a trial-balance CSV to load one entity/month. */
export function ImportTbButton({ entityId }: { entityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function submit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await importTrialBalanceAction({
        entityId,
        periodMonth: formData.get("periodMonth"),
        csv: formData.get("csv"),
        status: formData.get("status"),
      });
      if (res.ok) {
        setOk(true);
        setMsg(
          `Imported ${res.unmapped === 0 ? "" : `(${res.unmapped} unmapped) `}· ${res.balanced ? "balanced" : `OUT OF BALANCE by ${res.imbalance?.toFixed(2)}`}.`,
        );
        router.refresh();
      } else {
        setOk(false);
        setMsg(res.error);
      }
    });
  }

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import trial balance
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import trial balance">
        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Month</span>
              <input name="periodMonth" className="input" placeholder="2026-07" required />
            </label>
            <label className="field">
              <span className="micro-label">Status</span>
              <select name="status" className="input" defaultValue="OPEN">
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Rows (CSV)</span>
            <textarea
              name="csv"
              className="input font-mono text-[12px]"
              rows={10}
              required
              placeholder={"account name, debit, credit [, reportingCode]\nOR\naccount name, signed amount [, reportingCode]\n\nCash, 120000, 0, 1000\nAccounts Receivable, 48000, 0, 1100\nRevenue, 0, 210000, 4100\nPayroll, 90000, 0, 6000\n\n(no thousands separators; debit positive, credit reduces)"}
            />
          </label>
          <p className="text-[12px] text-muted">
            The optional last column is a reporting-COA code (see COA mapping) — accounts without one land in the exception queue.
          </p>
          {msg && <p className={`text-[13px] ${ok ? "text-accent-700" : "text-accent-700"}`}>{msg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Close
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Importing…" : "Import"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
