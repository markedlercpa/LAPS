"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncQboActualsAction } from "@/app/(dashboard)/finance/actions";

function monthLabel(ym: string): string {
  // ym = "YYYY-MM"
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * QBO actuals sync. Incremental by default — re-pulls only the months whose
 * transactions changed in QuickBooks since the last sync (plus the current
 * month), so a routine refresh is cheap. The first sync (or one after a long
 * gap) does a full trailing-24-month backfill. "Full re-sync" forces a complete
 * re-pull. No month needs to be picked; this is what fills the month dropdown.
 */
export function QboSyncButton({ entityId }: { entityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync(full = false) {
    setMsg(null);
    startTransition(async () => {
      const res = await syncQboActualsAction(entityId, 24, { full });
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      const label = res.mode === "incremental" ? "Incremental" : "Full";
      if (res.imported === 0) {
        setMsg(
          res.mode === "incremental"
            ? "Up to date — no changes in QuickBooks since the last sync."
            : "Connected, but QuickBooks returned no trial-balance data for the last 24 months."
        );
      } else {
        const range =
          res.firstMonth && res.lastMonth
            ? ` (${monthLabel(res.firstMonth)}${res.firstMonth === res.lastMonth ? "" : ` – ${monthLabel(res.lastMonth)}`})`
            : "";
        const gl = res.glLines ? ` + ${res.glLines.toLocaleString()} GL lines` : "";
        setMsg(`${label}: refreshed ${res.imported} month${res.imported === 1 ? "" : "s"}${range}${gl}.`);
      }
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
      <button
        className="btn btn-ghost text-[12px]"
        onClick={() => sync(true)}
        disabled={pending}
        title="Force a complete re-pull of the last 24 months (ignores change detection)"
      >
        Full re-sync
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => sync(false)}
        disabled={pending}
        title="Pull only what changed in QuickBooks since the last sync"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Syncing…" : "Sync from QBO"}
      </button>
    </span>
  );
}
