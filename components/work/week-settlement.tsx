"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { closeWeekAction } from "@/app/(dashboard)/work/capacity/actions";
import { centsToUsd } from "@/lib/work-taxonomy";

type WeekRow = { isoWeek: string; closed: boolean; totalCents: number | null };

/** Per-week settlement: close open weeks (computes + freezes charges). */
export function WeekSettlement({ weeks }: { weeks: WeekRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function close(isoWeek: string) {
    if (!confirm(`Close ${isoWeek}? Charges are computed and the week's bookings are frozen. This can't be undone here.`)) return;
    setBusy(isoWeek);
    setMsg(null);
    startTransition(async () => {
      const res = await closeWeekAction(isoWeek);
      setBusy(null);
      if (res.ok) {
        setMsg(`Closed ${isoWeek} — total charged ${centsToUsd(res.totalCents)}.`);
        router.refresh();
      } else setMsg(res.error);
    });
  }

  return (
    <div>
      <div className="micro-label mb-2">Week settlement</div>
      <table className="table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Status</th>
            <th className="num">Charged</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.isoWeek}>
              <td className="font-heading font-extrabold">{w.isoWeek}</td>
              <td>
                <span className={`tag ${w.closed ? "tag-accent" : "tag-neutral"}`}>{w.closed ? "Closed" : "Open"}</span>
              </td>
              <td className="num">{w.totalCents != null ? centsToUsd(w.totalCents) : "—"}</td>
              <td className="text-right">
                {!w.closed && (
                  <button className="btn btn-secondary" disabled={pending && busy === w.isoWeek} onClick={() => close(w.isoWeek)}>
                    <Lock className="h-4 w-4" /> {pending && busy === w.isoWeek ? "Closing…" : "Close"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="mt-2 text-[13px] text-muted">{msg}</p>}
    </div>
  );
}
