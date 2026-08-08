import type { IndirectForecast, IndirectRow } from "@/lib/pace/cash";

function fmt(cents: number): string {
  if (cents === 0) return "—";
  const s = Math.abs(Math.round(cents / 100)).toLocaleString("en-US");
  return cents < 0 ? `($${s})` : `$${s}`;
}

const numCell = "px-2 py-1 text-right whitespace-nowrap tabular-nums";
const rowLabel = "sticky left-0 z-10 bg-bg px-3 py-1 text-left whitespace-nowrap";

function rowTotal(r: IndirectRow): number {
  if (r.key === "ending") return r.values[r.values.length - 1];
  if (r.key === "beginning") return r.values[0];
  return r.values.reduce((s, x) => s + x, 0);
}

export function CashIndirect({ f }: { f: IndirectForecast }) {
  const cols = f.columns;

  const render = (r: IndirectRow) => (
    <tr key={r.key} className={r.strong ? "border-t-2 border-ink" : ""}>
      <td className={`${rowLabel} ${r.strong ? "font-heading font-extrabold" : r.sub ? "pl-6 text-muted" : ""}`}>{r.label}</td>
      {r.values.map((v, i) => (
        <td key={i} className={`${numCell} ${r.strong ? "font-heading font-extrabold" : ""} ${v < 0 ? "text-accent-700" : ""}`}>{fmt(v)}</td>
      ))}
      <td className={`${numCell} border-l border-divider ${r.strong ? "font-heading font-extrabold" : "text-muted"}`}>{fmt(rowTotal(r))}</td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={`${rowLabel} micro-label`}>Month</th>
            {cols.map((c) => <th key={c.num} className={`${numCell} micro-label`}>{c.date}</th>)}
            <th className={`${numCell} micro-label border-l border-divider`}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className={`${rowLabel} micro-label bg-surface`} colSpan={cols.length + 2}>INCOME STATEMENT</td></tr>
          {f.pnl.map(render)}
          <tr><td className={`${rowLabel} micro-label bg-surface`} colSpan={cols.length + 2}>CASH FLOW — INDIRECT</td></tr>
          {f.cash.map(render)}
        </tbody>
      </table>
    </div>
  );
}
