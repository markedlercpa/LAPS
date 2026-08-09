"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSnapshotConfigAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { asSnapshotConfig, type SnapshotConfig } from "@/lib/leadmagnets/snapshot";

export function SnapshotBuilder({ magnetId, initial }: { magnetId: string; initial: unknown }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cfg, setCfg] = useState<SnapshotConfig>(asSnapshotConfig(initial));
  const set = <K extends keyof SnapshotConfig>(k: K, v: SnapshotConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const num = (k: keyof SnapshotConfig) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (Number(e.target.value) || 0) as never);

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await saveSnapshotConfigAction(magnetId, cfg);
      setMsg(res.ok ? "Snapshot saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="card space-y-4 p-4">
      <div className="micro-label">Snapshot settings</div>
      <p className="text-[12px] text-muted">Inputs and metrics are a fixed, purpose-built set (margins, AR/AP days, adjusted EBITDA, valuation). Tune the benchmarks + multiples here.</p>

      <label className="field"><span className="micro-label">Intro</span>
        <textarea className="input min-h-[50px]" value={cfg.intro ?? ""} onChange={(e) => set("intro", e.target.value || undefined)} placeholder="Enter your latest annual figures for an instant health snapshot…" /></label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field"><span className="micro-label">EBITDA multiple — low (×)</span><input className="input" type="number" step="0.1" value={cfg.multipleLow} onChange={num("multipleLow")} /></label>
        <label className="field"><span className="micro-label">EBITDA multiple — high (×)</span><input className="input" type="number" step="0.1" value={cfg.multipleHigh} onChange={num("multipleHigh")} /></label>
        <label className="field"><span className="micro-label">Gross margin target (%)</span><input className="input" type="number" value={cfg.grossMarginTarget} onChange={num("grossMarginTarget")} /></label>
        <label className="field"><span className="micro-label">Operating margin target (%)</span><input className="input" type="number" value={cfg.operatingMarginTarget} onChange={num("operatingMarginTarget")} /></label>
        <label className="field"><span className="micro-label">AR days target</span><input className="input" type="number" value={cfg.arDaysTarget} onChange={num("arDaysTarget")} /></label>
        <label className="field"><span className="micro-label">AP days target</span><input className="input" type="number" value={cfg.apDaysTarget} onChange={num("apDaysTarget")} /></label>
      </div>

      <label className="field"><span className="micro-label">Results CTA → booking slug (optional)</span>
        <input className="input" value={cfg.bookingSlug ?? ""} onChange={(e) => set("bookingSlug", e.target.value || undefined)} placeholder="qoe-review-call" /></label>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>Save snapshot</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  );
}
