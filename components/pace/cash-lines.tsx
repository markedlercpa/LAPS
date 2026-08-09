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
  netTermsDays: number | null;
  paidWhenPaid: boolean;
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

  const catOptions = (
    <>
      {SECTIONS.map((s) => (
        <optgroup key={s.key} label={s.label}>
          {CASH_CATEGORIES.filter((c) => c.section === s.key).map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <form id="cash-line-form" action={add}>
      <div className="overflow-x-auto">
        <table className="table align-bottom">
          <thead>
            <tr>
              <th>Label</th>
              <th>Category</th>
              <th className="num">Amount ($)</th>
              <th>Cadence</th>
              <th>Start</th>
              <th>End</th>
              <th>Net terms</th>
              <th title="Pay only once the matching customer cash is collected (modeled as the net-terms shift).">Paid when paid</th>
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
                  <td className={`num ${def && def.sign < 0 ? "text-accent-700" : ""}`}>
                    {def && def.sign < 0 ? "(" : ""}${r.amount.toLocaleString()}{def && def.sign < 0 ? ")" : ""}
                  </td>
                  <td className="text-muted">{CADENCE_LABELS[r.cadence] ?? r.cadence}</td>
                  <td className="text-muted">{r.startDate}</td>
                  <td className="text-muted">{r.endDate ?? "—"}</td>
                  <td className="text-muted">{r.netTermsDays != null ? `net-${r.netTermsDays}` : "—"}</td>
                  <td className="text-muted">{r.paidWhenPaid ? "Yes" : "—"}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-ghost btn-icon" disabled={pending} onClick={() => del(r.id)} aria-label="Delete" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Inline add-a-line row */}
            <tr className="bg-surface">
              <td><input name="label" className="input" required placeholder="e.g. Office rent" /></td>
              <td>
                <select name="category" className="input" defaultValue="rent_occupancy" required>{catOptions}</select>
              </td>
              <td><input name="amount" type="number" step="0.01" min="0" className="input w-28 text-right" required placeholder="0.00" /></td>
              <td>
                <select name="cadence" className="input" defaultValue="MONTHLY">
                  {Object.entries(CADENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td><input name="startDate" type="date" className="input" defaultValue={today} required /></td>
              <td><input name="endDate" type="date" className="input" /></td>
              <td><input name="netTermsDays" type="number" min="0" max="180" className="input w-20 text-right" placeholder="30" title="Contractor net terms — shifts the payment forward by this many days (net-15 / net-30)." /></td>
              <td className="text-center"><input name="paidWhenPaid" type="checkbox" title="Pay only once the matching customer cash is collected." /></td>
              <td className="text-right">
                <button type="submit" className="btn btn-primary btn-icon" disabled={pending} aria-label="Add line" title="Add line"><Plus className="h-4 w-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" className="btn btn-secondary" disabled={pending}><Plus className="h-4 w-4" /> Add another line</button>
        {msg && <span className="text-[12px] text-accent-700">{msg}</span>}
        {rows.length === 0 && <span className="text-[12px] text-muted">Fill the bottom row and add recurring items (rent, debt service, taxes, owner draws, LOC) or one-offs — each feeds its matching statement row.</span>}
      </div>
    </form>
  );
}
