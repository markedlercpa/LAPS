"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { listQboBudgetsAction, importQboBudgetAction } from "@/app/(dashboard)/finance/budget-actions";

type QboBudget = { name: string; years: number[] };

/** Import a budget straight from QuickBooks. Since budgets are native to the
 * QBO account level, each budgeted account maps directly by its QBO id. */
export function ImportQboBudgetButton({ entities }: { entities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [budgets, setBudgets] = useState<QboBudget[] | null>(null);
  const [budgetName, setBudgetName] = useState("");
  const [year, setYear] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (entities.length === 0) return null;

  const load = () =>
    startTransition(async () => {
      setMsg(null);
      setBudgets(null);
      const res = await listQboBudgetsAction(entityId);
      if (!res.ok) { setMsg(res.error ?? "Failed"); return; }
      setBudgets(res.budgets);
      if (res.budgets[0]) {
        setBudgetName(res.budgets[0].name);
        setYear(String(res.budgets[0].years[0] ?? new Date().getUTCFullYear()));
      } else setMsg("No budgets found in QuickBooks for this company.");
    });

  const doImport = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await importQboBudgetAction({ entityId, fiscalYear: Number(year), budgetName });
      if (res.ok) {
        setMsg(`Imported ${res.imported} lines${res.skipped ? ` (${res.skipped} accounts unmatched)` : ""}.`);
        router.refresh();
      } else setMsg(res.error ?? "Import failed.");
    });

  const yearsForChosen = budgets?.find((b) => b.name === budgetName)?.years ?? [];

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Import from QBO
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import budget from QuickBooks">
        <div className="space-y-3">
          <label className="field">
            <span className="micro-label">Entity</span>
            <select className="input" value={entityId} onChange={(e) => { setEntityId(e.target.value); setBudgets(null); }}>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={load} disabled={pending}>{pending ? "Loading…" : "Load QBO budgets"}</button>

          {budgets && budgets.length > 0 && (
            <>
              <label className="field">
                <span className="micro-label">Budget</span>
                <select className="input" value={budgetName} onChange={(e) => { setBudgetName(e.target.value); const ys = budgets.find((b) => b.name === e.target.value)?.years ?? []; setYear(String(ys[0] ?? "")); }}>
                  {budgets.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="micro-label">Fiscal year</span>
                <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
                  {yearsForChosen.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </>
          )}

          {msg && <p className="text-[13px] text-accent-700">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Close</button>
            <button className="btn btn-primary" onClick={doImport} disabled={pending || !budgetName || !year}>Import</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
