import { Fragment } from "react";
import type { DirectForecast, StatementRow } from "@/lib/pace/cash";

function fmt(cents: number): string {
  if (cents === 0) return "—";
  const s = Math.abs(Math.round(cents / 100)).toLocaleString("en-US");
  return cents < 0 ? `($${s})` : `$${s}`;
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
  const cols = f.columns;
  const ff = f.firstFc;
  const actualCell = (i: number) => (i < ff ? "bg-surface" : "");
  const boundary = (i: number) => (i === ff && ff > 0 ? "border-l border-ink/40" : "");
  const totalCol = (r: StatementRow) => fmt(r.total);
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
              {g.rows.map((r) => spanValues(r.values, totalCol(r), { label: r.label, sub: true }))}
              {spanValues(g.subtotal, fmt(g.subtotalTotal), { label: g.subtotalLabel, strong: true })}
            </Fragment>
          ))}

          {spanValues(f.netOperating.values, fmt(f.netOperating.total), { label: f.netOperating.label, strong: true })}

          <tr><td className={`${rowLabel} micro-label bg-surface`} colSpan={cols.length + 2}>FINANCING</td></tr>
          {f.financing.rows.map((r) => spanValues(r.values, totalCol(r), { label: r.label, sub: true }))}
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
