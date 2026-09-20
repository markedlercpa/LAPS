"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveAuditConfigAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { asAuditConfig, type AuditConfig } from "@/lib/leadmagnets/audit";
import { cryptoId } from "@/lib/leadmagnets/quiz";

export function AuditBuilder({ magnetId, initial }: { magnetId: string; initial: unknown }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuditConfig>(asAuditConfig(initial));

  const patch = (next: Partial<AuditConfig>) => setCfg((c) => ({ ...c, ...next }));

  const addQ = (type: "select" | "text") =>
    patch({ questions: [...cfg.questions, { id: cryptoId(), prompt: "", type, required: type === "text", options: type === "select" ? [{ id: cryptoId(), label: "", weight: 0 }] : [] }] });
  const updateQ = (qi: number, field: "prompt" | "required", value: string | boolean) =>
    patch({ questions: cfg.questions.map((q, i) => (i === qi ? { ...q, [field]: value } : q)) });
  const removeQ = (qi: number) => patch({ questions: cfg.questions.filter((_, i) => i !== qi) });
  const addOpt = (qi: number) => patch({ questions: cfg.questions.map((q, i) => (i === qi ? { ...q, options: [...(q.options ?? []), { id: cryptoId(), label: "", weight: 0 }] } : q)) });
  const updateOpt = (qi: number, oi: number, field: "label" | "weight", value: string) =>
    patch({ questions: cfg.questions.map((q, i) => (i !== qi ? q : { ...q, options: (q.options ?? []).map((o, j) => (j === oi ? { ...o, [field]: field === "weight" ? Number(value) || 0 : value } : o)) })) });
  const removeOpt = (qi: number, oi: number) =>
    patch({ questions: cfg.questions.map((q, i) => (i !== qi ? q : { ...q, options: (q.options ?? []).filter((_, j) => j !== oi) })) });

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await saveAuditConfigAction(magnetId, cfg);
      setMsg(res.ok ? "Application saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="card space-y-5 p-4">
      <div className="micro-label">Application builder</div>

      <label className="field"><span className="micro-label">Intro (shown above the form)</span>
        <textarea className="input min-h-[60px]" value={cfg.intro ?? ""} onChange={(e) => patch({ intro: e.target.value || undefined })} placeholder="Who this call is for, what they’ll get…" /></label>

      {/* Questions */}
      <div className="space-y-4">
        {cfg.questions.map((q, qi) => (
          <div key={q.id} className="rounded-sm border border-divider p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="tag tag-neutral">{q.type === "text" ? "Text" : "Choice"}</span>
              <input className="input flex-1" value={q.prompt} placeholder={`Question ${qi + 1}`} onChange={(e) => updateQ(qi, "prompt", e.target.value)} />
              <label className="flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={!!q.required} onChange={(e) => updateQ(qi, "required", e.target.checked)} /> req</label>
              <button className="btn btn-ghost btn-icon text-accent-700" onClick={() => removeQ(qi)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
            {q.type === "select" && (
              <div className="space-y-1.5 pl-2">
                {(q.options ?? []).map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input className="input flex-1 text-[13px]" value={o.label} placeholder={`Answer ${oi + 1}`} onChange={(e) => updateOpt(qi, oi, "label", e.target.value)} />
                    <input className="input w-20 text-right text-[13px]" type="number" value={o.weight} title="Qualify weight" onChange={(e) => updateOpt(qi, oi, "weight", e.target.value)} />
                    <button className="btn btn-ghost btn-icon" onClick={() => removeOpt(qi, oi)} aria-label="Remove answer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button className="btn btn-ghost text-[12px]" onClick={() => addOpt(qi)}><Plus className="h-3.5 w-3.5" /> Answer</button>
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => addQ("select")}><Plus className="h-4 w-4" /> Choice question</button>
          <button className="btn btn-secondary" onClick={() => addQ("text")}><Plus className="h-4 w-4" /> Text question</button>
        </div>
      </div>

      {/* Qualify + booking handoff */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field"><span className="micro-label">Booking slug (/book/…)</span>
          <input className="input" value={cfg.bookingSlug ?? ""} onChange={(e) => patch({ bookingSlug: e.target.value || undefined })} placeholder="discovery-call" /></label>
        <label className="field"><span className="micro-label">Min score to qualify</span>
          <input className="input" type="number" value={cfg.minScore ?? ""} onChange={(e) => patch({ minScore: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="blank = everyone qualifies" /></label>
      </div>
      <label className="field"><span className="micro-label">If not qualified, show…</span>
        <textarea className="input min-h-[60px]" value={cfg.disqualifyMessage ?? ""} onChange={(e) => patch({ disqualifyMessage: e.target.value || undefined })} placeholder="Thanks — based on your answers this call isn’t the best fit right now. Here’s a resource instead…" /></label>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>Save application</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  );
}
