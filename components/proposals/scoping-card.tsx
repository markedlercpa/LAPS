"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StaffLevel } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { formatCurrency, cn } from "@/lib/utils";
import { computeScope } from "@/lib/scoping-math";
import { updateScoping } from "@/app/(dashboard)/proposals/actions";

const LEVEL_LABELS: Record<StaffLevel, string> = {
  ASSOCIATE: "Associate",
  SENIOR: "Senior",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  PARTNER: "Partner",
};

type Line = { level: StaffLevel; hours: number; costRate: number; billRate: number };

export function ScopingCard({
  proposalId,
  locked,
  scoping,
}: {
  proposalId: string;
  locked: boolean;
  scoping: { lines: Line[]; markupEnabled: boolean; markupPct: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(false);

  const [lines, setLines] = useState<Line[]>(scoping.lines);
  const [markupEnabled, setMarkupEnabled] = useState(scoping.markupEnabled);
  const [markupPct, setMarkupPct] = useState(String(scoping.markupPct));

  const num = parseFloat(markupPct) || 0;
  const c = computeScope(lines, markupEnabled, num);

  const setField = (level: StaffLevel, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.level === level ? { ...l, [field]: parseFloat(value) || 0 } : l)),
    );
  };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateScoping(proposalId, {
        markupEnabled,
        markupPct: num,
        lines: lines.map((l) => ({
          level: l.level,
          hours: l.hours,
          costRate: l.costRate,
          billRate: l.billRate,
        })),
      });
      if (!res.ok) {
        setMsg(res.error ?? "Failed to save scope");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  };

  return (
    <div className="border-2 border-ink">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-surface px-4 py-3">
        <div>
          <MicroLabel>Scoping engine</MicroLabel>
          <div className="mt-0.5 text-[13px] text-muted">
            Estimate hours by level — required before sending. Internal only.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowRates((s) => !s)}
            type="button"
          >
            {showRates ? "Hide rates" : "Edit rates"}
          </button>
          {!locked && (
            <button className="btn btn-primary" onClick={save} disabled={pending}>
              {saved ? "Saved" : "Save scope & price"}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Level</th>
              <th className="num">Hours</th>
              {showRates && <th className="num">Cost/hr</th>}
              {showRates && <th className="num">Bill/hr</th>}
              <th className="num">Budget cost</th>
              <th className="num">Budget rev.</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.level}>
                <td className="font-heading font-extrabold">{LEVEL_LABELS[l.level]}</td>
                <td className="num">
                  <input
                    className="input h-8 w-20 text-right"
                    type="number"
                    min={0}
                    value={l.hours || ""}
                    placeholder="0"
                    disabled={locked || pending}
                    onChange={(e) => setField(l.level, "hours", e.target.value)}
                  />
                </td>
                {showRates && (
                  <td className="num">
                    <input
                      className="input h-8 w-24 text-right"
                      type="number"
                      min={0}
                      value={l.costRate || ""}
                      disabled={locked || pending}
                      onChange={(e) => setField(l.level, "costRate", e.target.value)}
                    />
                  </td>
                )}
                {showRates && (
                  <td className="num">
                    <input
                      className="input h-8 w-24 text-right"
                      type="number"
                      min={0}
                      value={l.billRate || ""}
                      disabled={locked || pending}
                      onChange={(e) => setField(l.level, "billRate", e.target.value)}
                    />
                  </td>
                )}
                <td className="num text-muted">{formatCurrency(l.hours * l.costRate)}</td>
                <td className="num text-muted">{formatCurrency(l.hours * l.billRate)}</td>
              </tr>
            ))}
            <tr>
              <td className="micro-label border-t-2 border-divider pt-3">
                Total · {c.totalHours} hrs
              </td>
              <td className="border-t-2 border-divider" />
              {showRates && <td className="border-t-2 border-divider" />}
              {showRates && <td className="border-t-2 border-divider" />}
              <td className="num border-t-2 border-divider pt-3 font-semibold">
                {formatCurrency(c.budgetCost)}
              </td>
              <td className="num border-t-2 border-divider pt-3 font-semibold">
                {formatCurrency(c.budgetRevenue)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Sales-value markup */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t-2 border-divider pt-4">
          <label className="flex items-center gap-2 text-[14px]" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={markupEnabled}
              disabled={locked || pending}
              onChange={(e) => setMarkupEnabled(e.target.checked)}
            />
            <span>Sales-value pricing markup</span>
          </label>
          <div className="field" style={{ opacity: markupEnabled ? 1 : 0.5 }}>
            <input
              className="input h-8 w-24 text-right"
              type="number"
              min={0}
              value={markupPct}
              disabled={!markupEnabled || locked || pending}
              onChange={(e) => setMarkupPct(e.target.value)}
            />
          </div>
          <span className="text-[13px] text-muted">% over standard billing</span>
        </div>

        {/* Results */}
        <div className="mt-4 grid grid-cols-2 border-y-2 border-divider md:grid-cols-4">
          <Result label="Quoted revenue" value={formatCurrency(c.quotedRevenue)} big />
          <Result
            label="Realization"
            value={`${(c.realization * 100).toFixed(0)}%`}
            accent={c.realization < 1}
          />
          <Result label="Margin" value={formatCurrency(c.marginAmount)} />
          <Result
            label="Margin %"
            value={`${c.marginPct.toFixed(0)}%`}
            accent={c.marginPct < 40}
          />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Saving sets the client fee to the quoted revenue and the internal margin from budget
          cost. The client never sees hours, rates, or cost.
        </p>
        {msg && <p className="mt-2 text-[14px] text-accent-700">{msg}</p>}
      </div>
    </div>
  );
}

function Result({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="border-r border-divider px-3 pb-3 pt-3 last:border-r-0">
      <div className="micro-label">{label}</div>
      <div
        className={cn(
          "mt-1 font-heading font-extrabold [font-variant-numeric:tabular-nums]",
          big ? "text-[24px]" : "text-[20px]",
          accent && "text-accent-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}
