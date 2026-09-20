"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MultiStatement, ColumnKey } from "@/lib/pace/statements";
import { MetricRow } from "@/components/metric-row";
import { formatCurrency, cn } from "@/lib/utils";

function fmt(v: number, key: ColumnKey): string {
  if (key === "deltaYoYPct") return `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
  if (key === "deltaYoY") return `${v > 0 ? "+" : ""}${formatCurrency(v)}`;
  return formatCurrency(v);
}

export function StatementMulti({
  data,
  entityParam,
}: {
  data: MultiStatement;
  entityParam: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (s: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const ym = data.asOf;
  const s = data.subtotals;
  const firstCol = 0; // headline metrics use the first selected column
  const metrics =
    data.statement === "IS"
      ? [
          { label: "Revenue", value: formatCurrency(s.revenue?.[firstCol] ?? 0) },
          { label: "Gross Profit", value: formatCurrency(s.grossProfit?.[firstCol] ?? 0) },
          { label: "Operating Income", value: formatCurrency(s.operatingIncome?.[firstCol] ?? 0) },
          { label: "Net Income", value: formatCurrency(s.netIncome?.[firstCol] ?? 0), accent: true },
        ]
      : [
          { label: "Assets", value: formatCurrency(s.assets?.[firstCol] ?? 0) },
          { label: "Liabilities", value: formatCurrency(s.liabilities?.[firstCol] ?? 0) },
          { label: "Equity", value: formatCurrency(s.equity?.[firstCol] ?? 0) },
          { label: "A − (L+E)", value: formatCurrency(s.checkDiff?.[firstCol] ?? 0), accent: Math.abs(s.checkDiff?.[firstCol] ?? 0) > 0.5 },
        ];

  type SubRow = { label: string; values: number[]; strong?: boolean };
  // QBO interleaves running subtotals into the statement: Gross Profit right
  // after COGS, Net Operating Income after Expenses. Keyed by the section they
  // follow so they render inline in QBO order.
  const interleaved: Record<string, SubRow[]> =
    data.statement === "IS"
      ? {
          COGS: [{ label: "Gross Profit", values: s.grossProfit ?? [], strong: true }],
          OpEx: [{ label: "Net Operating Income", values: s.operatingIncome ?? [] }],
        }
      : {};

  // Grand-total rows under the table (after every section), per statement.
  const totalRows: SubRow[] =
    data.statement === "IS"
      ? [{ label: "Net Income", values: s.netIncome ?? [], strong: true }]
      : [
          { label: "Total Assets", values: s.assets ?? [], strong: true },
          { label: "Total Liabilities", values: s.liabilities ?? [] },
          { label: "Total Equity", values: s.equity ?? [] },
        ];

  const emitted = new Set<string>();
  const renderSub = (r: SubRow) => (
    <tr key={r.label} className={r.strong ? "border-t-2 border-divider" : ""}>
      <td className={r.strong ? "font-heading font-extrabold" : "font-heading"}>{r.label}</td>
      {r.values.map((v, ci) => (
        <td key={ci} className={cn("num", r.strong && "font-heading font-extrabold")}>{fmt(v, data.columns[ci].key)}</td>
      ))}
    </tr>
  );

  return (
    <div>
      <MetricRow metrics={metrics} />

      <div className="mt-5 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              {data.columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => {
              const isCollapsed = collapsed.has(g.section);
              return (
                <Fragment key={g.section}>
                  <tr className="cursor-pointer" onClick={() => toggle(g.section)}>
                    <td className="pt-4">
                      <span className="inline-flex items-center gap-1 font-heading text-[12px] font-extrabold uppercase tracking-wide text-muted">
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !isCollapsed && "rotate-90")} />
                        {g.label}
                      </span>
                    </td>
                    {g.subtotals.map((v, ci) => (
                      <td key={ci} className="num pt-4 text-muted">{isCollapsed ? fmt(v, data.columns[ci].key) : ""}</td>
                    ))}
                  </tr>
                  {!isCollapsed &&
                    g.lines.map((l) => (
                      <tr key={l.ledgerAccountId}>
                        <td style={{ paddingLeft: `${12 + l.depth * 16}px` }}>
                          <a
                            className="text-accent-700"
                            href={`/finance/ledger?entity=${entityParam}&account=${l.ledgerAccountId}&from=${ym}&to=${ym}`}
                            title="Drill into the transactions behind this line"
                          >
                            {l.acctNum ? <span className="text-muted">{l.acctNum} · </span> : null}
                            {l.name}
                          </a>
                        </td>
                        {l.amounts.map((v, ci) => (
                          <td key={ci} className="num">{fmt(v, data.columns[ci].key)}</td>
                        ))}
                      </tr>
                    ))}
                  {!isCollapsed && (
                    <tr>
                      <td className="font-heading font-extrabold">Total {g.label}</td>
                      {g.subtotals.map((v, ci) => (
                        <td key={ci} className="num font-heading font-extrabold">{fmt(v, data.columns[ci].key)}</td>
                      ))}
                    </tr>
                  )}
                  {(interleaved[g.section] ?? []).map((r) => {
                    emitted.add(r.label);
                    return renderSub(r);
                  })}
                </Fragment>
              );
            })}

            <tr><td colSpan={data.columns.length + 1} className="py-1"></td></tr>
            {/* Any interleaved subtotal whose anchor section was absent, then the grand totals. */}
            {Object.values(interleaved).flat().filter((r) => !emitted.has(r.label)).map(renderSub)}
            {totalRows.map(renderSub)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
