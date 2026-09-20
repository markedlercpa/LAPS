"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Save } from "lucide-react";
import { WEEKDAYS_LONG, minutesToLabel } from "@/lib/booking-time";
import { saveAvailability } from "@/app/(dashboard)/scheduling/actions";

type Range = { startMin: number; endMin: number };
export type RuleInput = { weekday: number; startMin: number; endMin: number };

const STEP = 15;
const TIME_OPTIONS = Array.from({ length: (24 * 60) / STEP + 1 }, (_, i) => i * STEP);

function TimeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="input !min-h-[32px] !w-auto py-1 text-[13px]" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {TIME_OPTIONS.map((m) => (
        <option key={m} value={m}>{minutesToLabel(m)}</option>
      ))}
    </select>
  );
}

export function AvailabilityEditor({ initial }: { initial: RuleInput[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Group ranges by weekday.
  const [byDay, setByDay] = useState<Record<number, Range[]>>(() => {
    const m: Record<number, Range[]> = {};
    for (let d = 0; d < 7; d++) m[d] = [];
    for (const r of initial) m[r.weekday].push({ startMin: r.startMin, endMin: r.endMin });
    for (let d = 0; d < 7; d++) m[d].sort((a, b) => a.startMin - b.startMin);
    return m;
  });

  const setDay = (d: number, ranges: Range[]) => {
    setByDay((prev) => ({ ...prev, [d]: ranges }));
    setSaved(false);
  };

  const addRange = (d: number) => {
    const last = byDay[d][byDay[d].length - 1];
    const startMin = last ? Math.min(last.endMin + 60, 22 * 60) : 9 * 60;
    setDay(d, [...byDay[d], { startMin, endMin: Math.min(startMin + 60, 24 * 60) }]);
  };

  const save = () => {
    const rules: RuleInput[] = [];
    for (let d = 0; d < 7; d++) {
      for (const r of byDay[d]) rules.push({ weekday: d, startMin: r.startMin, endMin: r.endMin });
    }
    startTransition(async () => {
      await saveAvailability(rules);
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="border-2 border-divider bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="micro-label">Weekly availability</div>
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : saved ? "Saved" : "Save hours"}
        </button>
      </div>
      <div className="mt-3 divide-y divide-divider">
        {WEEKDAYS_LONG.map((label, d) => (
          <div key={d} className="grid grid-cols-[110px_1fr] items-start gap-3 py-3">
            <div className="pt-1.5 text-[14px] font-medium">{label}</div>
            <div className="space-y-2">
              {byDay[d].length === 0 && (
                <span className="text-[13px] text-muted">Unavailable</span>
              )}
              {byDay[d].map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TimeSelect value={r.startMin} onChange={(v) => setDay(d, byDay[d].map((x, j) => (j === i ? { ...x, startMin: v } : x)))} />
                  <span className="text-muted">–</span>
                  <TimeSelect value={r.endMin} onChange={(v) => setDay(d, byDay[d].map((x, j) => (j === i ? { ...x, endMin: v } : x)))} />
                  <button className="btn-icon text-neutral-500 hover:text-accent" onClick={() => setDay(d, byDay[d].filter((_, j) => j !== i))} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost -ml-1 text-[13px]" onClick={() => addRange(d)}>
                <Plus className="h-3.5 w-3.5" /> Add hours
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
