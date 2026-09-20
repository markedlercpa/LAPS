"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCashConfigAction } from "@/app/(dashboard)/finance/cash-actions";

export type CashConfigValues = {
  useQboOpening: boolean;
  opening: number;
  openingAsOf: string;
  minCash: number;
  locLimit: number;
  locOpening: number;
  dnaMonthly: number;
  capexMonthly: number;
  arDays: number;
  apDays: number;
};

export function CashAssumptions({
  values,
  qboOpening,
  qboAsOf,
}: {
  values: CashConfigValues;
  qboOpening: number | null; // dollars, from QB ledgers
  qboAsOf: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [useQbo, setUseQbo] = useState(values.useQboOpening);

  function submit(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await setCashConfigAction({
        useQboOpening: useQbo ? "true" : "",
        opening: fd.get("opening"),
        openingAsOf: fd.get("openingAsOf"),
        minCash: fd.get("minCash"),
        locLimit: fd.get("locLimit"),
        locOpening: fd.get("locOpening"),
        dnaMonthly: fd.get("dnaMonthly"),
        capexMonthly: fd.get("capexMonthly"),
        arDays: fd.get("arDays"),
        apDays: fd.get("apDays"),
      });
      setMsg(res.ok ? "Saved." : res.error);
      if (res.ok) router.refresh();
    });
  }

  const money = (name: string, label: string, def: number, help?: string) => (
    <label className="field">
      <span className="micro-label">{label}</span>
      <input name={name} type="number" step="0.01" className="input w-40 text-right" defaultValue={def} />
      {help && <span className="text-[11px] text-muted">{help}</span>}
    </label>
  );

  return (
    <form action={submit} className="space-y-5">
      <div className="card p-4">
        <div className="micro-label mb-3">Beginning cash</div>
        <label className="mb-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={useQbo} onChange={(e) => setUseQbo(e.target.checked)} />
          Pull beginning cash automatically from the QB ledgers
          {qboOpening != null && (
            <span className="text-muted">
              (latest: ${qboOpening.toLocaleString()}{qboAsOf ? ` as of ${qboAsOf}` : ""})
            </span>
          )}
        </label>
        {!useQbo && (
          <div className="flex flex-wrap items-end gap-2">
            {money("opening", "Manual opening ($)", values.opening)}
            <label className="field">
              <span className="micro-label">As of</span>
              <input name="openingAsOf" type="date" className="input" defaultValue={values.openingAsOf} />
            </label>
          </div>
        )}
        {/* keep hidden fields present when using QBO so the form always posts them */}
        {useQbo && (
          <>
            <input type="hidden" name="opening" value={values.opening} />
            <input type="hidden" name="openingAsOf" value={values.openingAsOf} />
          </>
        )}
        {qboOpening == null && useQbo && (
          <p className="text-[12px] text-accent-700">No QB balance sheet loaded yet — sync actuals in Finance → Actuals, or uncheck to enter opening manually.</p>
        )}
      </div>

      <div className="card p-4">
        <div className="micro-label mb-3">Liquidity & buffer</div>
        <div className="flex flex-wrap items-end gap-3">
          {money("minCash", "Minimum cash threshold ($)", values.minCash)}
          {money("locLimit", "LOC limit ($)", values.locLimit)}
          {money("locOpening", "LOC drawn at start ($)", values.locOpening)}
        </div>
      </div>

      <div className="card p-4">
        <div className="micro-label mb-3">12-month indirect assumptions</div>
        <div className="flex flex-wrap items-end gap-3">
          {money("dnaMonthly", "D&A / month ($)", values.dnaMonthly, "used only if the budget has no D&A line")}
          {money("capexMonthly", "Capex / month ($)", values.capexMonthly)}
          <label className="field">
            <span className="micro-label">AR days</span>
            <input name="arDays" type="number" min="0" max="365" className="input w-24 text-right" defaultValue={values.arDays} />
          </label>
          <label className="field">
            <span className="micro-label">AP days</span>
            <input name="apDays" type="number" min="0" max="365" className="input w-24 text-right" defaultValue={values.apDays} />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-muted">The P&L (Revenue → COGS → OpEx → EBITDA → net income) is driven by the Finance budgets — the LOCKED budget per entity/fiscal-year, else the latest.</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save assumptions"}</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </form>
  );
}
