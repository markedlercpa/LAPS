"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncQboActualsAction } from "@/app/(dashboard)/pace/actions";

function monthLabel(ym: string): string {
  // ym = "YYYY-MM"
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * One-click QBO actuals sync — pulls the trailing two years of trial balances
 * for this entity and imports every month that has data. No month needs to be
 * picked first; this is what fills the month dropdown.
 */
export function QboSyncButton({ entityId }: { entityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncQboActualsAction(entityId);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      if (res.imported === 0) {
        setMsg("Connected, but QuickBooks returned no trial-balance data for the last 24 months.");
      } else {
        const range =
          res.firstMonth && res.lastMonth
            ? ` (${monthLabel(res.firstMonth)} – ${monthLabel(res.lastMonth)})`
            : "";
        const gl = res.glLines ? ` + ${res.glLines.toLocaleString()} GL lines` : "";
        setMsg(`Imported ${res.imported} month${res.imported === 1 ? "" : "s"}${range}${gl}.`);
      }
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
      <button className="btn btn-secondary" onClick={sync} disabled={pending} title="Pull the last 24 months of trial balances from QuickBooks">
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Syncing…" : "Sync from QBO"}
      </button>
    </span>
  );
}
