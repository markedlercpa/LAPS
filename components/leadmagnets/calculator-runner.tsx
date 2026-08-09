"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { captureCalculatorAction, type CalcResult } from "@/app/lm/[slug]/actions";
import { formatCalcOutput, type CalculatorConfig, type CalcOutputUnit } from "@/lib/leadmagnets/calculator";

export function CalculatorRunner({
  slug, body, ctaLabel, config, source, contentItemId,
}: {
  slug: string;
  body: string | null;
  ctaLabel: string;
  config: CalculatorConfig;
  source: string | null;
  contentItemId: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(config.inputs.map((i) => [i.id, i.default != null ? String(i.default) : ""])),
  );
  const [result, setResult] = useState<Extract<CalcResult, { ok: true }> | null>(null);

  const setV = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  const submit = (fd: FormData) => {
    setError(null);
    const numeric: Record<string, number> = {};
    for (const i of config.inputs) numeric[i.id] = Number(values[i.id]) || 0;
    start(async () => {
      const res = await captureCalculatorAction({
        slug,
        email: String(fd.get("email") ?? ""),
        name: String(fd.get("name") ?? "") || null,
        company: String(fd.get("company") ?? "") || null,
        values: numeric,
        source, contentItemId,
      });
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
    });
  };

  if (result) {
    return (
      <div className="reader-panel">
        <div className="mb-3 flex items-center gap-2 text-accent"><CheckCircle2 className="h-5 w-5" /><span className="micro-label">Your result</span></div>
        <p className="mb-1 text-[14px] text-muted">{result.outputLabel}</p>
        <div className="mb-4 font-heading text-4xl font-extrabold">{formatCalcOutput(result.output, result.outputUnit as CalcOutputUnit)}</div>
        {result.band?.headline && <h2 className="mb-1">{result.band.headline}</h2>}
        {result.band?.body && <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">{result.band.body}</p>}
        {result.band?.recommendations && result.band.recommendations.length > 0 && (
          <div className="mb-6">
            <div className="micro-label mb-2">Recommended next steps</div>
            <ul className="list-disc space-y-1 pl-5 text-[15px]">{result.band.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        <div className="no-print flex flex-wrap gap-2">
          {result.bookingSlug && <a href={`/book/${result.bookingSlug}`} className="btn btn-primary">Book a call to go deeper</a>}
          <button className="btn btn-secondary" onClick={() => window.print()}>Save as PDF</button>
        </div>
        <p className="mt-4 text-[11px] text-muted">Estimate only — not financial advice.</p>
      </div>
    );
  }

  return (
    <>
      {(config.intro || body) && <div className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed">{config.intro || body}</div>}
      <form action={submit} className="space-y-4 rounded-md border border-divider bg-surface p-6">
        {config.inputs.map((i) => (
          <label key={i.id} className="field">
            <span className="micro-label">{i.label}{i.kind === "currency" ? " ($)" : i.kind === "percent" ? " (%)" : ""}</span>
            <input type="number" step="any" className="input" value={values[i.id] ?? ""} onChange={(e) => setV(i.id, e.target.value)} placeholder="0" />
            {i.help && <span className="mt-1 text-[11px] text-muted">{i.help}</span>}
          </label>
        ))}
        <div className="border-t border-divider pt-3">
          <label className="field"><span className="micro-label">Name</span><input name="name" className="input" placeholder="Your name" autoComplete="name" /></label>
          <label className="field mt-2"><span className="micro-label">Work email</span><input name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" /></label>
          <label className="field mt-2"><span className="micro-label">Company</span><input name="company" className="input" placeholder="Company (optional)" autoComplete="organization" /></label>
        </div>
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>{pending ? "Calculating…" : ctaLabel}</button>
        {error && <p className="text-[12px] text-accent-700">{error}</p>}
        <p className="text-center text-[11px] text-muted">We’ll email your result. No spam.</p>
      </form>
    </>
  );
}
