"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Lock, Unlock } from "lucide-react";
import { saveBudgetGridAction, setBudgetStatusAction } from "@/app/(dashboard)/finance/budget-actions";
import { formatCurrency } from "@/lib/utils";

export type BudgetGridRow = {
  ledgerAccountId: string;
  acctNum: string | null;
  name: string;
  section: string;
  sectionLabel: string;
  monthly: Record<string, number>;
};

function monthShort(key: string): string {
  const [, m] = key.split("-");
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1] ?? key;
}

/**
 * Editable budget grid: the entity's QBO accounts × 12 months, grouped by
 * statement section. Holds edits in state and saves the whole grid in one
 * action. Read-only when the budget is locked.
 */
export function BudgetGrid({
  budgetId,
  months,
  rows,
  locked,
}: {
  budgetId: string;
  months: string[];
  rows: BudgetGridRow[];
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      init[r.ledgerAccountId] = {};
      for (const m of months) init[r.ledgerAccountId][m] = r.monthly[m] != null ? String(r.monthly[m]) : "";
    }
    return init;
  });

  function setCell(accId: string, month: string, value: string) {
    setData((d) => ({ ...d, [accId]: { ...d[accId], [month]: value } }));
  }
  function rowTotal(accId: string): number {
    return months.reduce((s, m) => s + (Number(data[accId]?.[m]) || 0), 0);
  }

  function save() {
    setMsg(null);
    const lines = rows.map((r) => {
      const monthly: Record<string, number> = {};
      for (const m of months) {
        const n = Number(data[r.ledgerAccountId]?.[m]);
        if (data[r.ledgerAccountId]?.[m] !== "" && Number.isFinite(n)) monthly[m] = n;
      }
      return { ledgerAccountId: r.ledgerAccountId, monthly };
    });
    startTransition(async () => {
      const res = await saveBudgetGridAction(budgetId, lines);
      setMsg(res.ok ? `Saved ${res.saved} lines.` : res.error);
      if (res.ok) router.refresh();
    });
  }

  function toggleLock() {
    startTransition(async () => {
      await setBudgetStatusAction(budgetId, !locked);
      router.refresh();
    });
  }

  // Section order preserved from the (already-sorted) rows.
  const sections: { key: string; label: string }[] = [];
  for (const r of rows) if (!sections.some((s) => s.key === r.section)) sections.push({ key: r.section, label: r.sectionLabel });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {!locked && (
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save grid"}
          </button>
        )}
        <button className="btn btn-secondary" onClick={toggleLock} disabled={pending}>
          {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {locked ? "Unlock" : "Lock version"}
        </button>
        {msg && <span className="text-[13px] text-muted">{msg}</span>}
        {locked && <span className="text-[13px] text-accent-700">Locked — unlock to edit.</span>}
      </div>

      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">
          No accounts for this entity yet. Sync the QuickBooks chart of accounts on <a className="text-accent-700" href="/finance/actuals">Actuals</a>, then budget by account here.
        </p>
      ) : (
        <div className="overflow-x-auto border-2 border-divider">
          <table className="table min-w-[1100px] text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface">Account</th>
                {months.map((m) => <th key={m} className="num">{monthShort(m)}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.key}>
                  <tr>
                    <td colSpan={months.length + 2} className="micro-label bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] py-1.5">{sec.label}</td>
                  </tr>
                  {rows.filter((r) => r.section === sec.key).map((r) => (
                    <GridRow key={r.ledgerAccountId} r={r} months={months} data={data} setCell={setCell} rowTotal={rowTotal} locked={locked} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GridRow({
  r,
  months,
  data,
  setCell,
  rowTotal,
  locked,
}: {
  r: BudgetGridRow;
  months: string[];
  data: Record<string, Record<string, string>>;
  setCell: (a: string, m: string, v: string) => void;
  rowTotal: (a: string) => number;
  locked: boolean;
}) {
  return (
    <tr>
      <td className="sticky left-0 whitespace-nowrap bg-surface">
        {r.acctNum ? <span className="text-muted">{r.acctNum} · </span> : null}
        {r.name}
      </td>
      {months.map((m) => (
        <td key={m} className="num p-0">
          <input
            className="w-[72px] bg-transparent px-1 py-1 text-right text-[12px] outline-none focus:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [font-variant-numeric:tabular-nums]"
            value={data[r.ledgerAccountId]?.[m] ?? ""}
            disabled={locked}
            inputMode="decimal"
            onChange={(e) => setCell(r.ledgerAccountId, m, e.target.value)}
          />
        </td>
      ))}
      <td className="num [font-variant-numeric:tabular-nums]">{formatCurrency(rowTotal(r.ledgerAccountId))}</td>
    </tr>
  );
}
