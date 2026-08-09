"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DirectForecast, StatementRow } from "@/lib/pace/cash";
import { setCashRowManualAction, setCashRowValueAction } from "@/app/(dashboard)/finance/cash-actions";

function fmt(cents: number): string {
  if (cents === 0) return "—";
  const s = Math.abs(Math.round(cents / 100)).toLocaleString("en-US");
  return cents < 0 ? `($${s})` : `$${s}`;
}

/** One editable grid cell for a manual-override line item (magnitude dollars). */
function EditCell({ mode, category, columnKey, magnitude }: { mode: "daily" | "weekly"; category: string; columnKey: string; magnitude: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(magnitude ? String(magnitude) : "");
  useEffect(() => { setVal(magnitude ? String(magnitude) : ""); }, [magnitude]);
  return (
    <input
      type="number"
      min="0"
      step="1"
      value={val}
      disabled={pending}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => start(async () => { await setCashRowValueAction({ mode, category, columnKey, amount: Number(val) || 0 }); router.refresh(); })}
      className="w-16 rounded-sm border border-divider bg-bg px-1 py-0.5 text-right tabular-nums focus:border-accent focus:outline-none"
      placeholder="0"
    />
  );
}

/** Relative red→green band for the liquidity heatmap row. */
function heat(value: number, min: number, max: number): string {
  const frac = max > min ? (value - min) / (max - min) : 1;
  if (frac < 0.34) return "rgba(236,48,19,0.34)";
  if (frac < 0.67) return "rgba(236,48,19,0.14)";
  return "rgba(70,160,90,0.28)";
}

const numCell = "px-2 py-1 text-right whitespace-nowrap tabular-nums";
const rowLabel = "sticky left-0 z-10 bg-bg px-3 py-1 text-left whitespace-nowrap";

export function CashStatement({ f }: { f: DirectForecast }) {
  const router = useRouter();
  const [pendingToggle, startToggle] = useTransition();
  const cols = f.columns;
  const ff = f.firstFc;
  const mode = f.mode as "daily" | "weekly";
  const actualCell = (i: number) => (i < ff ? "bg-surface" : "");
  const boundary = (i: number) => (i === ff && ff > 0 ? "border-l border-ink/40" : "");

  const toggleManual = (category: string, next: boolean) =>
    startToggle(async () => { await setCashRowManualAction({ mode, category, manual: next }); router.refresh(); });

  // An editable category line item: an A/M toggle on the label, and — when
  // manual — typed inputs in the forecast columns (actuals stay read-only).
  const catRow = (r: StatementRow) => {
    const isManual = !!f.manual[r.key];
    return (
      <tr key={r.key}>
        <td className={`${rowLabel} pl-6 text-muted`}>
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={pendingToggle}
              onClick={() => toggleManual(r.key, !isManual)}
              title={isManual ? "Manual override — click to use assumptions" : "Assumptions — click to enter values manually"}
              className={`rounded px-1 text-[10px] font-heading font-extrabold leading-4 ${isManual ? "bg-accent text-white" : "border border-divider bg-bg text-muted"}`}
            >
              {isManual ? "M" : "A"}
            </button>
            {r.label}
          </span>
        </td>
        {r.values.map((v, i) =>
          i >= ff && isManual ? (
            <td key={i} className={`${numCell} ${boundary(i)}`}>
              <EditCell mode={mode} category={r.key} columnKey={cols[i].key} magnitude={Math.round(Math.abs(v) / 100)} />
            </td>
          ) : (
            <td key={i} className={`${numCell} ${actualCell(i)} ${boundary(i)} ${v < 0 ? "text-accent-700" : "text-muted"}`}>{fmt(v)}</td>
          ),
        )}
        <td className={`${numCell} border-l border-divider text-muted`}>{fmt(r.total)}</td>
      </tr>
    );
  };
  const spanValues = (values: number[], total: string | null, opts: { strong?: boolean; sub?: boolean; label: string; muted?: boolean }) => (
    <tr className={opts.strong ? "border-t-2 border-ink" : ""}>
      <td className={`${rowLabel} ${opts.strong ? "font-heading font-extrabold" : opts.sub ? "pl-6 text-muted" : ""}`}>{opts.label}</td>
      {values.map((v, i) => (
        <td key={i} className={`${numCell} ${actualCell(i)} ${boundary(i)} ${opts.strong ? "font-heading font-extrabold" : ""} ${v < 0 ? "text-accent-700" : opts.muted ? "text-muted" : ""}`}>{fmt(v)}</td>
      ))}
      <td className={`${numCell} border-l border-divider ${opts.strong ? "font-heading font-extrabold" : "text-muted"}`}>{total ?? ""}</td>
    </tr>
  );

  const liq = f.loc.totalLiquidity;
  const lmin = Math.min(...liq);
  const lmax = Math.max(...liq);

  const isDaily = f.mode === "daily";

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-[11px] text-muted">
        Shaded columns are actuals. Each line item shows <span className="font-heading font-extrabold">A</span> (assumptions) —
        click to switch to <span className="font-heading font-extrabold">M</span> and type your own values into the forecast cells.
      </p>
      <table className="border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={rowLabel}></th>
            {ff > 0 && <th colSpan={ff} className={`${numCell} micro-label bg-surface text-left`}>Actuals</th>}
            <th colSpan={cols.length - ff} className={`${numCell} micro-label ${ff > 0 ? "border-l border-ink/40" : ""} text-left`}>Forecast</th>
            <th className={`${numCell} border-l border-divider`}></th>
          </tr>
          <tr>
            <th className={`${rowLabel} micro-label`}>{isDaily ? "Day #" : "Week #"}</th>
            {cols.map((c, i) => <th key={i} className={`${numCell} micro-label ${actualCell(i)} ${boundary(i)}`}>{c.num}</th>)}
            <th className={`${numCell} micro-label border-l border-divider`}>Total</th>
          </tr>
          <tr>
            <th className={`${rowLabel} micro-label`}>{isDaily ? "Date" : "Week Ending (Fri)"}</th>
            {cols.map((c, i) => <th key={i} className={`${numCell} micro-label ${actualCell(i)} ${boundary(i)}`}>{c.date}</th>)}
            <th className={`${numCell} border-l border-divider`}></th>
          </tr>
          <tr>
            <th className={`${rowLabel} micro-label text-neutral-500`}>{isDaily ? "Day" : "Week Start"}</th>
            {cols.map((c, i) => <th key={i} className={`${numCell} micro-label text-neutral-500 ${actualCell(i)} ${boundary(i)}`}>{c.sub}</th>)}
            <th className={`${numCell} border-l border-divider`}></th>
          </tr>
        </thead>
        <tbody>
          {spanValues(f.beginning, fmt(f.beginning[0]), { label: "Beginning Cash", muted: true })}

          {f.groups.map((g) => (
            <Fragment key={g.title}>
              <tr><td className={`${rowLabel} micro-label bg-surface`} colSpan={cols.length + 2}>{g.title}</td></tr>
              {g.rows.map(catRow)}
              {spanValues(g.subtotal, fmt(g.subtotalTotal), { label: g.subtotalLabel, strong: true })}
            </Fragment>
          ))}

          {spanValues(f.netOperating.values, fmt(f.netOperating.total), { label: f.netOperating.label, strong: true })}

          <tr><td className={`${rowLabel} micro-label bg-surface`} colSpan={cols.length + 2}>FINANCING</td></tr>
          {f.financing.rows.map(catRow)}
          {spanValues(f.financing.subtotal, fmt(f.financing.subtotalTotal), { label: f.financing.subtotalLabel, strong: true })}

          {spanValues(f.ending, fmt(f.ending[f.ending.length - 1]), { label: "Ending Cash", strong: true })}

          <tr><td className={`${rowLabel}`} colSpan={cols.length + 2}></td></tr>
          {spanValues(f.loc.balance, fmt(f.loc.balance[f.loc.balance.length - 1]), { label: "Ending LOC Balance", muted: true })}
          {spanValues(f.loc.availability, fmt(f.loc.availability[f.loc.availability.length - 1]), { label: "LOC Availability", muted: true })}

          {/* Total Liquidity — heatmap */}
          <tr className="border-t-2 border-ink">
            <td className={`${rowLabel} font-heading font-extrabold`}>Total Liquidity (Cash + LOC Avail.)</td>
            {liq.map((v, i) => (
              <td key={i} className={`${numCell} font-heading font-extrabold`} style={{ backgroundColor: heat(v, lmin, lmax) }}>{fmt(v)}</td>
            ))}
            <td className={`${numCell} border-l border-divider font-heading font-extrabold`}>{fmt(liq[liq.length - 1])}</td>
          </tr>

          {f.minThreshold > 0 && (
            <>
              {spanValues(new Array(cols.length).fill(f.minThreshold), fmt(f.minThreshold), { label: "Minimum Cash Threshold", muted: true })}
              {spanValues(f.cushion, fmt(f.cushion[f.cushion.length - 1]), { label: "Cushion vs Minimum", strong: true })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
