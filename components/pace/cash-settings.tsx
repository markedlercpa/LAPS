"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCashPositionAction } from "@/app/(dashboard)/finance/cash-actions";

/** Opening cash + min-cash buffer. Opening can be prefilled from the latest TB. */
export function CashSettings({
  opening,
  openingAsOf,
  minCash,
  actualSuggestion,
}: {
  opening: number; // dollars
  openingAsOf: string; // YYYY-MM-DD
  minCash: number; // dollars
  actualSuggestion: number | null; // dollars from latest balance sheet
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(String(opening));

  function submit(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await setCashPositionAction({
        opening: fd.get("opening"),
        openingAsOf: fd.get("openingAsOf"),
        minCash: fd.get("minCash"),
      });
      setMsg(res.ok ? "Saved." : res.error);
      if (res.ok) router.refresh();
    });
  }

  return (
    <form action={submit} className="card flex flex-wrap items-end gap-2 p-4">
      <label className="field">
        <span className="micro-label">Opening cash ($)</span>
        <input name="opening" type="number" step="0.01" className="input w-40 text-right" value={open} onChange={(e) => setOpen(e.target.value)} required />
      </label>
      {actualSuggestion != null && (
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(String(actualSuggestion))} title="From the latest balance sheet">
          Use actual: ${actualSuggestion.toLocaleString()}
        </button>
      )}
      <label className="field">
        <span className="micro-label">As of</span>
        <input name="openingAsOf" type="date" className="input" defaultValue={openingAsOf} required />
      </label>
      <label className="field">
        <span className="micro-label">Min-cash buffer ($)</span>
        <input name="minCash" type="number" step="0.01" min="0" className="input w-40 text-right" defaultValue={minCash} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save opening"}</button>
      {msg && <span className="pb-2 text-[12px] text-muted">{msg}</span>}
    </form>
  );
}
