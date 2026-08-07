"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { importQboBudgetAction } from "@/app/(dashboard)/pace/budget-actions";

/** Import a budget from a QBO-connected entity into a new PACE version. */
export function ImportQboBudgetButton({ entities }: { entities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (entities.length === 0) return null;

  function submit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await importQboBudgetAction({
        entityId: formData.get("entityId"),
        fiscalYear: formData.get("fiscalYear"),
      });
      if (res.ok) {
        setMsg(`Imported ${res.imported} lines from "${res.qboBudgetName}"${res.skipped ? ` · ${res.skipped} skipped (unmapped — see COA Mapping)` : ""}.`);
        router.push(`/pace/budgets/${res.budgetId}`);
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Import from QBO
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import budget from QuickBooks">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Entity (QBO-connected)</span>
            <select name="entityId" className="input" required defaultValue={entities[0]?.id}>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="micro-label">Fiscal year</span>
            <input name="fiscalYear" type="number" className="input" defaultValue={new Date().getUTCFullYear()} required />
          </label>
          <p className="text-[12px] text-muted">
            Pulls the company&apos;s budget from QuickBooks and maps accounts to your reporting COA. Unmapped
            accounts are skipped and flagged in COA Mapping — map them and re-import to include them.
          </p>
          {msg && <p className="text-[13px] text-accent-700">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Close</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
