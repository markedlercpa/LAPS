"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import type { VarianceRow } from "@/lib/pace/variance";
import { formatCurrency } from "@/lib/utils";
import { draftNarrativeAction, saveNarrativeAction } from "@/app/(dashboard)/pace/budget-actions";

export type VarianceViewRow = VarianceRow & { note: string | null };

export function VarianceView({
  entityId,
  entityName,
  periodMonthISO,
  periodLabel,
  rows,
  subtotals,
  exceptionOnly,
  aiEnabled,
}: {
  entityId: string;
  entityName: string;
  periodMonthISO: string;
  periodLabel: string;
  rows: VarianceViewRow[];
  subtotals: Record<string, { actual: number; budget: number; varianceAmt: number }>;
  exceptionOnly: boolean;
  aiEnabled: boolean;
}) {
  const sub = (t: string) => subtotals[t] ?? { actual: 0, budget: 0, varianceAmt: 0 };
  const revenue = sub("Revenue");
  const net = {
    actual: (subtotals.Revenue?.actual ?? 0) - (subtotals.COGS?.actual ?? 0) - (subtotals.OpEx?.actual ?? 0) - (subtotals.OtherExpense?.actual ?? 0),
    budget: (subtotals.Revenue?.budget ?? 0) - (subtotals.COGS?.budget ?? 0) - (subtotals.OpEx?.budget ?? 0) - (subtotals.OtherExpense?.budget ?? 0),
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        <Chip label="Revenue var" a={revenue.actual} b={revenue.budget} />
        <Chip label="Net income var" a={net.actual} b={net.budget} favorableIfPositive />
        <span className="tag tag-neutral">{periodLabel}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">
          {exceptionOnly ? "No material variances this period — nothing over the threshold." : "No activity this period."}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Actual</th>
              <th className="num">Budget</th>
              <th className="num">Variance</th>
              <th className="num">%</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.reportingAccountId}
                r={r}
                entityId={entityId}
                entityName={entityName}
                periodMonthISO={periodMonthISO}
                periodLabel={periodLabel}
                aiEnabled={aiEnabled}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Chip({ label, a, b, favorableIfPositive }: { label: string; a: number; b: number; favorableIfPositive?: boolean }) {
  const v = a - b;
  const good = favorableIfPositive ? v >= 0 : v >= 0;
  return (
    <span className={`tag ${Math.abs(v) < 1 ? "tag-neutral" : good ? "tag-accent" : "tag-outline"}`}>
      {label}: {formatCurrency(v)}
    </span>
  );
}

function Row({
  r,
  entityId,
  entityName,
  periodMonthISO,
  periodLabel,
  aiEnabled,
}: {
  r: VarianceViewRow;
  entityId: string;
  entityName: string;
  periodMonthISO: string;
  periodLabel: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.note ?? "");
  const [aiDrafted, setAiDrafted] = useState(false);

  const favClass = r.favorable === null ? "" : r.favorable ? "text-accent-700" : "text-accent";
  const pct = r.variancePct === null ? "—" : `${(r.variancePct * 100).toFixed(0)}%`;

  function aiDraft() {
    startTransition(async () => {
      const res = await draftNarrativeAction({
        accountName: r.name,
        actual: r.actual,
        budget: r.budget,
        varianceAmt: r.varianceAmt,
        variancePct: r.variancePct,
        favorable: r.favorable,
        periodLabel,
        entityName,
      });
      if (res.ok && res.text) {
        setText(res.text);
        setAiDrafted(true);
      }
    });
  }

  function save() {
    if (!text.trim()) return;
    startTransition(async () => {
      await saveNarrativeAction({ entityId, reportingAccountId: r.reportingAccountId, periodMonthISO, text, aiDrafted });
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <tr className={r.material ? "" : "opacity-70"}>
      <td>
        {r.name}
        {r.material && <span className="ml-2 tag tag-outline">flagged</span>}
      </td>
      <td className="num [font-variant-numeric:tabular-nums]">{formatCurrency(r.actual)}</td>
      <td className="num [font-variant-numeric:tabular-nums]">{formatCurrency(r.budget)}</td>
      <td className={`num [font-variant-numeric:tabular-nums] ${favClass}`}>{formatCurrency(r.varianceAmt)}</td>
      <td className="num [font-variant-numeric:tabular-nums]">{pct}</td>
      <td className="min-w-[280px]">
        {editing ? (
          <div className="space-y-1">
            <textarea className="input text-[12px]" rows={2} value={text} onChange={(e) => { setText(e.target.value); setAiDrafted(false); }} />
            <div className="flex items-center gap-1">
              <button className="btn btn-primary text-[11px]" onClick={save} disabled={pending || !text.trim()}>
                <Check className="h-3 w-3" /> Save
              </button>
              {aiEnabled && (
                <button className="btn btn-ghost text-[11px]" onClick={aiDraft} disabled={pending}>
                  <Sparkles className="h-3 w-3" /> {pending ? "…" : "AI draft"}
                </button>
              )}
              <button className="btn btn-ghost text-[11px]" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
            </div>
          </div>
        ) : text ? (
          <span className="cursor-pointer text-[13px]" onClick={() => setEditing(true)}>{text}</span>
        ) : (
          <button className="btn btn-ghost text-[12px]" onClick={() => setEditing(true)}>+ Explain</button>
        )}
      </td>
    </tr>
  );
}
