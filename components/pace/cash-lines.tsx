"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addCashLineAction, deleteCashLineAction } from "@/app/(dashboard)/finance/cash-actions";

export type CashLineRow = {
  id: string;
  label: string;
  kind: "INFLOW" | "OUTFLOW";
  amount: number; // dollars
  cadence: string;
  startDate: string;
  endDate: string | null;
  category: string | null;
};

const CADENCE_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
};

/** Manual cash lines layered onto the auto-derived flows. */
export function CashLines({ rows }: { rows: CashLineRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function add(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await addCashLineAction({
        label: fd.get("label"),
        kind: fd.get("kind"),
        amount: fd.get("amount"),
        cadence: fd.get("cadence"),
        startDate: fd.get("startDate"),
        endDate: fd.get("endDate") || undefined,
        category: fd.get("category") || undefined,
      });
      if (res.ok) {
        router.refresh();
        (document.getElementById("cash-line-form") as HTMLFormElement | null)?.reset();
      } else setMsg(res.error);
    });
  }

  function del(id: string) {
    startTransition(async () => {
      await deleteCashLineAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <form id="cash-line-form" action={add} className="card mb-3 flex flex-wrap items-end gap-2 p-4">
        <label className="field flex-1 min-w-[160px]">
          <span className="micro-label">Label</span>
          <input name="label" className="input" required placeholder="Office rent" />
        </label>
        <label className="field">
          <span className="micro-label">Direction</span>
          <select name="kind" className="input" defaultValue="OUTFLOW">
            <option value="OUTFLOW">Outflow</option>
            <option value="INFLOW">Inflow</option>
          </select>
        </label>
        <label className="field">
          <span className="micro-label">Amount ($)</span>
          <input name="amount" type="number" step="0.01" min="0" className="input w-32 text-right" required />
        </label>
        <label className="field">
          <span className="micro-label">Cadence</span>
          <select name="cadence" className="input" defaultValue="MONTHLY">
            {Object.entries(CADENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="micro-label">Start</span>
          <input name="startDate" type="date" className="input" defaultValue={today} required />
        </label>
        <label className="field">
          <span className="micro-label">End (optional)</span>
          <input name="endDate" type="date" className="input" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}><Plus className="h-4 w-4" /> Add line</button>
        {msg && <span className="pb-2 text-[12px] text-accent-700">{msg}</span>}
      </form>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No manual lines yet. Add recurring items (rent, debt service, taxes, owner draws) or one-offs.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Direction</th>
              <th>Cadence</th>
              <th>From</th>
              <th>To</th>
              <th className="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-heading font-extrabold">{r.label}</td>
                <td><span className={`tag ${r.kind === "INFLOW" ? "tag-accent" : "tag-neutral"}`}>{r.kind === "INFLOW" ? "In" : "Out"}</span></td>
                <td className="text-muted">{CADENCE_LABELS[r.cadence] ?? r.cadence}</td>
                <td className="text-muted">{r.startDate}</td>
                <td className="text-muted">{r.endDate ?? "—"}</td>
                <td className="num">${r.amount.toLocaleString()}</td>
                <td className="text-right">
                  <button className="btn btn-ghost btn-icon" disabled={pending} onClick={() => del(r.id)} aria-label="Delete" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
