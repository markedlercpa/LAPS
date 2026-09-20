"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createBudgetAction } from "@/app/(dashboard)/finance/budget-actions";

export function NewBudgetButton({
  entities,
  budgets,
}: {
  entities: { id: string; name: string }[];
  budgets: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const thisYear = new Date().getUTCFullYear();

  function submit(formData: FormData) {
    setError(null);
    const copyFromId = String(formData.get("copyFromId") || "");
    startTransition(async () => {
      const res = await createBudgetAction({
        entityId: formData.get("entityId"),
        fiscalYear: formData.get("fiscalYear"),
        label: formData.get("label"),
        kind: formData.get("kind"),
        copyFromId: copyFromId || undefined,
      });
      if (res.ok) {
        setOpen(false);
        router.push(`/finance/budgets/${res.id}`);
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={entities.length === 0}>
        <Plus className="h-4 w-4" /> New budget
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New budget version">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Entity</span>
            <select name="entityId" className="input" required defaultValue={entities[0]?.id}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Fiscal year</span>
              <input name="fiscalYear" type="number" className="input" defaultValue={thisYear} required />
            </label>
            <label className="field">
              <span className="micro-label">Kind</span>
              <select name="kind" className="input" defaultValue="ORIGINAL">
                <option value="ORIGINAL">Original</option>
                <option value="REFORECAST">Reforecast</option>
                <option value="SCENARIO">Scenario</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Version label</span>
            <input name="label" className="input" placeholder="FY Original / Q2 Reforecast / Downside" required />
          </label>
          <label className="field">
            <span className="micro-label">Copy amounts from (optional)</span>
            <select name="copyFromId" className="input" defaultValue="">
              <option value="">— start blank —</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
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
