"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StaffLevel } from "@prisma/client";
import { STAFF_LEVEL_LABELS } from "@/lib/rate-card";
import { updateRateCard } from "@/app/(dashboard)/settings/actions";

type Row = { level: StaffLevel; cost: number; bill: number };

export function RateCardEditor({ rows: initial }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(initial);
  const [saved, setSaved] = useState(false);

  const set = (level: StaffLevel, field: "cost" | "bill", value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.level === level ? { ...r, [field]: parseFloat(value) || 0 } : r)),
    );

  const save = () =>
    startTransition(async () => {
      await updateRateCard({ rows });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });

  return (
    <div className="max-w-[520px] border-2 border-ink">
      <div className="flex items-center justify-between border-b-2 border-ink bg-surface px-4 py-3">
        <div className="micro-label">Standard rate card</div>
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {saved ? "Saved" : "Save rates"}
        </button>
      </div>
      <table className="table w-full">
        <thead>
          <tr>
            <th>Level</th>
            <th className="num">Cost / hr</th>
            <th className="num">Bill / hr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level}>
              <td className="font-heading font-extrabold">{STAFF_LEVEL_LABELS[r.level]}</td>
              <td className="num">
                <input
                  className="input h-8 w-28 text-right"
                  type="number"
                  min={0}
                  value={r.cost}
                  disabled={pending}
                  onChange={(e) => set(r.level, "cost", e.target.value)}
                />
              </td>
              <td className="num">
                <input
                  className="input h-8 w-28 text-right"
                  type="number"
                  min={0}
                  value={r.bill}
                  disabled={pending}
                  onChange={(e) => set(r.level, "bill", e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
