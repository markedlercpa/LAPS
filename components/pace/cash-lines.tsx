"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addCashLineAction, deleteCashLineAction } from "@/app/(dashboard)/finance/cash-actions";
import { CASH_CATEGORIES, CASH_CATEGORY_MAP, CADENCE_LABELS } from "@/lib/pace/cash-taxonomy";

export type CashLineRow = {
  id: string;
  label: string;
  category: string;
  amount: number; // dollars
  cadence: string;
  startDate: string;
  endDate: string | null;
};

const SECTIONS: { key: "RECEIPTS" | "DISBURSEMENTS" | "FINANCING"; label: string }[] = [
  { key: "RECEIPTS", label: "Receipts" },
  { key: "DISBURSEMENTS", label: "Disbursements" },
  { key: "FINANCING", label: "Financing" },
];

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
        category: fd.get("category"),
        amount: fd.get("amount"),
        cadence: fd.get("cadence"),
        startDate: fd.get("startDate"),
        endDate: fd.get("endDate") || undefined,
        netTermsDays: fd.get("netTermsDays") || undefined,
        paidWhenPaid: fd.get("paidWhenPaid") === "on",
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
        <label className="field min-w-[200px]">
          <span className="micro-label">Category</span>
          <select name="category" className="input" defaultValue="rent_occupancy" required>
            {SECTIONS.map((s) => (
              <optgroup key={s.key} label={s.label}>
                {CASH_CATEGORIES.filter((c) => c.section === s.key).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </optgroup>
            ))}
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
        <label className="field">
          <span className="micro-label">Net terms (days)</span>
          <input name="netTermsDays" type="number" min="0" max="180" className="input w-24 text-right" placeholder="e.g. 30" title="Contractor net terms — shifts the payment forward by this many days (net-15 / net-30)." />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-[12px]" title="Pay only once the matching customer cash is collected (modeled as the net-terms shift).">
          <input name="paidWhenPaid" type="checkbox" /> Paid when paid
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}><Plus className="h-4 w-4" /> Add line</button>
        {msg && <span className="pb-2 text-[12px] text-accent-700">{msg}</span>}
      </form>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No manual lines yet. Add recurring items (rent, debt service, taxes, owner draws, LOC) or one-offs — they populate the matching statement row.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Category</th>
              <th>Cadence</th>
              <th>From</th>
              <th>To</th>
              <th className="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const def = CASH_CATEGORY_MAP[r.category];
              return (
                <tr key={r.id}>
                  <td className="font-heading font-extrabold">{r.label}</td>
                  <td className="text-muted">{def?.label ?? r.category}</td>
                  <td className="text-muted">{CADENCE_LABELS[r.cadence] ?? r.cadence}</td>
                  <td className="text-muted">{r.startDate}</td>
                  <td className="text-muted">{r.endDate ?? "—"}</td>
                  <td className={`num ${def && def.sign < 0 ? "text-accent-700" : ""}`}>
                    {def && def.sign < 0 ? "(" : ""}${r.amount.toLocaleString()}{def && def.sign < 0 ? ")" : ""}
                  </td>
                  <td className="text-right">
                    <button className="btn btn-ghost btn-icon" disabled={pending} onClick={() => del(r.id)} aria-label="Delete" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
