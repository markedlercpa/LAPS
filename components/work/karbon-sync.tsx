"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { triggerKarbonSyncAction } from "@/app/(dashboard)/work/capacity/actions";

type SyncResult = {
  entries: number;
  applied: number;
  weeks: string[];
  unmatchedResources: string[];
  unmatchedWorkItems: string[];
};

/** Manual "Sync now" trigger for Karbon actuals + unmatched-row report. */
export function KarbonSyncButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  function sync() {
    setMsg(null);
    setResult(null);
    startTransition(async () => {
      const res = await triggerKarbonSyncAction();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setResult({
        entries: res.entries,
        applied: res.applied,
        weeks: res.weeks,
        unmatchedResources: res.unmatchedResources,
        unmatchedWorkItems: res.unmatchedWorkItems,
      });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button className="btn btn-secondary" onClick={sync} disabled={pending || !configured}>
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Syncing…" : "Sync now"}
        </button>
        {!configured && <span className="text-[12px] text-muted">Set KARBON_BEARER_TOKEN / KARBON_ACCESS_KEY to enable.</span>}
        {msg && <span className="text-[12px] text-accent-700">{msg}</span>}
      </div>

      {result && (
        <div className="mt-3 border-2 border-divider bg-surface p-3 text-[13px]">
          <p>
            Pulled <strong>{result.entries}</strong> time entries, applied <strong>{result.applied}</strong> consumed-hour
            rows across {result.weeks.length} week{result.weeks.length === 1 ? "" : "s"}.
          </p>
          {result.unmatchedResources.length > 0 && (
            <p className="mt-2 text-accent-700">
              Unmatched people (no pool resource with that email): {result.unmatchedResources.slice(0, 10).join(", ")}
              {result.unmatchedResources.length > 10 ? `, +${result.unmatchedResources.length - 10}` : ""}
            </p>
          )}
          {result.unmatchedWorkItems.length > 0 && (
            <p className="mt-1 text-accent-700">
              Unmatched work items (no engagement with that key): {result.unmatchedWorkItems.slice(0, 10).join(", ")}
              {result.unmatchedWorkItems.length > 10 ? `, +${result.unmatchedWorkItems.length - 10}` : ""}
            </p>
          )}
          {result.unmatchedResources.length === 0 && result.unmatchedWorkItems.length === 0 && (
            <p className="mt-1 text-muted">Everything matched.</p>
          )}
        </div>
      )}
    </div>
  );
}
