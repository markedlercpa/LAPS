"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveCalculatorConfigAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { asCalculatorConfig, type CalculatorConfig, type CalcInputKind, type CalcOutputUnit } from "@/lib/leadmagnets/calculator";
import { cryptoId } from "@/lib/leadmagnets/quiz";

const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || cryptoId();

export function CalculatorBuilder({ magnetId, initial }: { magnetId: string; initial: unknown }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cfg, setCfg] = useState<CalculatorConfig>(asCalculatorConfig(initial));
  const patch = (n: Partial<CalculatorConfig>) => setCfg((c) => ({ ...c, ...n }));

  const addInput = () => patch({ inputs: [...cfg.inputs, { id: "", label: "", kind: "number" }] });
  const updateInput = (i: number, field: keyof CalculatorConfig["inputs"][number], value: string) =>
    patch({ inputs: cfg.inputs.map((inp, j) => (j === i ? { ...inp, [field]: field === "kind" ? (value as CalcInputKind) : value } : inp)) });
  const blurInputId = (i: number) => patch({ inputs: cfg.inputs.map((inp, j) => (j === i ? { ...inp, id: inp.id ? slugId(inp.id) : slugId(inp.label) } : inp)) });
  const removeInput = (i: number) => patch({ inputs: cfg.inputs.filter((_, j) => j !== i) });

  const addBand = () => patch({ bands: [...cfg.bands, { key: cryptoId(), label: "", min: 0, max: 0, headline: "", body: "", recommendations: [] }] });
  const updateBand = (bi: number, field: string, value: string) =>
    patch({ bands: cfg.bands.map((b, i) => (i === bi ? { ...b, [field]: field === "min" || field === "max" ? Number(value) || 0 : value } : b)) });
  const updateBandRecs = (bi: number, text: string) =>
    patch({ bands: cfg.bands.map((b, i) => (i === bi ? { ...b, recommendations: text.split("\n").map((s) => s.trim()).filter(Boolean) } : b)) });
  const removeBand = (bi: number) => patch({ bands: cfg.bands.filter((_, i) => i !== bi) });

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await saveCalculatorConfigAction(magnetId, cfg);
      setMsg(res.ok ? "Calculator saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="card space-y-5 p-4">
      <div className="micro-label">Calculator builder</div>

      <label className="field"><span className="micro-label">Intro</span>
        <textarea className="input min-h-[50px]" value={cfg.intro ?? ""} onChange={(e) => patch({ intro: e.target.value || undefined })} placeholder="What this estimates…" /></label>

      {/* Inputs */}
      <div>
        <div className="micro-label mb-2">Inputs</div>
        <div className="space-y-2">
          {cfg.inputs.map((inp, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className="input flex-1 min-w-[160px] text-[13px]" value={inp.label} placeholder="Label (e.g. EBITDA)" onChange={(e) => updateInput(i, "label", e.target.value)} />
              <input className="input w-32 text-[12px]" value={inp.id} placeholder="var id" title="Use this in the formula" onChange={(e) => updateInput(i, "id", e.target.value)} onBlur={() => blurInputId(i)} />
              <select className="input w-28 text-[12px]" value={inp.kind} onChange={(e) => updateInput(i, "kind", e.target.value)}>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
              </select>
              <button className="btn btn-ghost btn-icon" onClick={() => removeInput(i)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addInput}><Plus className="h-4 w-4" /> Add input</button>
        </div>
      </div>

      {/* Formula + output */}
      <label className="field"><span className="micro-label">Formula (use the var ids; + − × ÷ ^ and parentheses)</span>
        <input className="input font-mono text-[13px]" value={cfg.formula} onChange={(e) => patch({ formula: e.target.value })} placeholder="ebitda * multiple" /></label>
      {cfg.inputs.length > 0 && <p className="-mt-2 text-[11px] text-muted">Variables: {cfg.inputs.map((i) => i.id || "—").join(", ")}</p>}
      <div className="flex flex-wrap gap-3">
        <label className="field flex-1 min-w-[180px]"><span className="micro-label">Output label</span>
          <input className="input" value={cfg.outputLabel} onChange={(e) => patch({ outputLabel: e.target.value })} placeholder="Estimated enterprise value" /></label>
        <label className="field"><span className="micro-label">Output unit</span>
          <select className="input" value={cfg.outputUnit} onChange={(e) => patch({ outputUnit: e.target.value as CalcOutputUnit })}>
            <option value="currency">Currency ($)</option>
            <option value="multiple">Multiple (×)</option>
            <option value="percent">Percent (%)</option>
            <option value="number">Number</option>
          </select></label>
      </div>

      {/* Interpretation bands (on the output value) */}
      <div>
        <div className="micro-label mb-2">Interpretation bands (min/max on the output value)</div>
        <div className="space-y-3">
          {cfg.bands.map((b, bi) => (
            <div key={b.key} className="rounded-sm border border-divider p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input className="input flex-1 min-w-[140px]" value={b.label} placeholder="Band label" onChange={(e) => updateBand(bi, "label", e.target.value)} />
                <label className="flex items-center gap-1 text-[12px] text-muted">min <input className="input w-24 text-right" type="number" value={b.min} onChange={(e) => updateBand(bi, "min", e.target.value)} /></label>
                <label className="flex items-center gap-1 text-[12px] text-muted">max <input className="input w-24 text-right" type="number" value={b.max} onChange={(e) => updateBand(bi, "max", e.target.value)} /></label>
                <button className="btn btn-ghost btn-icon text-accent-700" onClick={() => removeBand(bi)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input className="input mb-1.5" value={b.headline ?? ""} placeholder="Results headline" onChange={(e) => updateBand(bi, "headline", e.target.value)} />
              <textarea className="input mb-1.5 min-h-[50px]" value={b.body ?? ""} placeholder="Interpretation…" onChange={(e) => updateBand(bi, "body", e.target.value)} />
              <textarea className="input min-h-[50px] text-[13px]" value={(b.recommendations ?? []).join("\n")} placeholder="Recommendations — one per line" onChange={(e) => updateBandRecs(bi, e.target.value)} />
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addBand}><Plus className="h-4 w-4" /> Add band</button>
        </div>
      </div>

      <label className="field"><span className="micro-label">Results CTA → booking slug (optional)</span>
        <input className="input" value={cfg.bookingSlug ?? ""} onChange={(e) => patch({ bookingSlug: e.target.value || undefined })} placeholder="discovery-call" /></label>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>Save calculator</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  );
}
