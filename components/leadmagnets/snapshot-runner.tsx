"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { captureSnapshotAction, type SnapshotResponse } from "@/app/lm/[slug]/actions";
import { SNAPSHOT_FIELDS, fmtMoney, type SnapshotInputs, type SnapshotConfig, type Flag } from "@/lib/leadmagnets/snapshot";

const flagClass: Record<Flag, string> = {
  good: "border-l-2 border-[rgb(70,160,90)]",
  watch: "border-l-2 border-accent",
  risk: "border-l-2 border-accent-700",
};
const flagLabel: Record<Flag, string> = { good: "On track", watch: "Watch", risk: "Needs work" };

export function SnapshotRunner({
  slug, body, ctaLabel, config, source, contentItemId,
}: {
  slug: string;
  body: string | null;
  ctaLabel: string;
  config: SnapshotConfig;
  source: string | null;
  contentItemId: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Extract<SnapshotResponse, { ok: true }> | null>(null);
  const setV = (id: string, v: string) => setVals((s) => ({ ...s, [id]: v }));

  const submit = (fd: FormData) => {
    setError(null);
    const inputs = Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f.id, Number(vals[f.id]) || 0])) as unknown as SnapshotInputs;
    start(async () => {
      const r = await captureSnapshotAction({
        slug, email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? "") || null,
        company: String(fd.get("company") ?? "") || null, inputs, source, contentItemId,
      });
      if (!r.ok) { setError(r.error); return; }
      setRes(r);
    });
  };

  if (res) {
    const s = res.result;
    return (
      <div className="reader-panel">
        <div className="mb-3 flex items-center gap-2 text-accent"><CheckCircle2 className="h-5 w-5" /><span className="micro-label">Your snapshot</span></div>
        <h1 className="mb-1">{s.bandLabel}</h1>
        <p className="mb-5 text-[15px] leading-relaxed">{s.bandBody}</p>

        <div className="mb-5 rounded-md border border-divider bg-surface p-4">
          <div className="micro-label mb-1">Estimated enterprise value</div>
          <div className="font-heading text-3xl font-extrabold">{fmtMoney(s.valuationLow)} – {fmtMoney(s.valuationHigh)}</div>
          <div className="text-[12px] text-muted">On {fmtMoney(s.adjEbitda)} adjusted EBITDA</div>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {s.metrics.map((m) => (
            <div key={m.key} className={`rounded-sm bg-surface p-3 ${flagClass[m.flag]}`}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted">{m.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted">{flagLabel[m.flag]}</span>
              </div>
              <div className="font-heading text-xl font-extrabold">{m.formatted}</div>
              {m.note && <div className="text-[11px] text-muted">{m.note}</div>}
            </div>
          ))}
        </div>

        <div className="no-print flex flex-wrap gap-2">
          {res.bookingSlug && <a href={`/book/${res.bookingSlug}`} className="btn btn-primary">Book a call to walk through this</a>}
          <button className="btn btn-secondary" onClick={() => window.print()}>Save as PDF</button>
        </div>
        <p className="mt-4 text-[11px] text-muted">Estimate based on the figures you entered — directional, not a formal valuation or advice.</p>
      </div>
    );
  }

  return (
    <>
      {(config.intro || body) && <div className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed">{config.intro || body}</div>}
      <form action={submit} className="space-y-3 rounded-md border border-divider bg-surface p-6">
        <p className="text-[12px] text-muted">Enter your latest annual figures (from QuickBooks or your P&L / balance sheet).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SNAPSHOT_FIELDS.map((f) => (
            <label key={f.id} className="field">
              <span className="micro-label">{f.label}</span>
              <input type="number" step="any" className="input" value={vals[f.id] ?? ""} placeholder="$" onChange={(e) => setV(f.id, e.target.value)} />
              {f.help && <span className="mt-1 text-[11px] text-muted">{f.help}</span>}
            </label>
          ))}
        </div>
        <div className="border-t border-divider pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field"><span className="micro-label">Name</span><input name="name" className="input" autoComplete="name" /></label>
            <label className="field"><span className="micro-label">Work email</span><input name="email" type="email" required className="input" autoComplete="email" /></label>
            <label className="field"><span className="micro-label">Company</span><input name="company" className="input" autoComplete="organization" /></label>
          </div>
        </div>
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>{pending ? "Analyzing…" : ctaLabel}</button>
        {error && <p className="text-[12px] text-accent-700">{error}</p>}
        <p className="text-center text-[11px] text-muted">Your figures are used only to generate this snapshot.</p>
      </form>
    </>
  );
}
