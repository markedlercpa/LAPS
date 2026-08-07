"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEngagementBudgetAction } from "@/app/(dashboard)/work/capacity/actions";

/** Edit an engagement's budgeted hours per role band. */
export function EngagementBudgetEditor({
  engagementId,
  bands,
  initial,
}: {
  engagementId: string;
  bands: { id: string; name: string }[];
  initial: Record<string, number>; // roleBandId → budgeted hours
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Record<string, string>>(
    Object.fromEntries(bands.map((b) => [b.id, String(initial[b.id] ?? 0)])),
  );
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveEngagementBudgetAction({
        engagementId,
        rows: bands.map((b) => ({ roleBandId: b.id, budgetedHours: Number(rows[b.id]) || 0 })),
      });
      setMsg(res.ok ? "Budget saved." : res.error);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="card p-4">
      <div className="micro-label mb-3">Budgeted hours by role band</div>
      <div className="space-y-2">
        {bands.map((b) => (
          <label key={b.id} className="flex items-center justify-between gap-3">
            <span className="font-heading text-[14px] font-extrabold">{b.name}</span>
            <input
              type="number"
              min="0"
              step="1"
              className="input w-28 text-right"
              value={rows[b.id] ?? "0"}
              onChange={(e) => setRows((r) => ({ ...r, [b.id]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
        <button className="btn btn-primary ml-auto" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save budget"}
        </button>
      </div>
    </div>
  );
}
