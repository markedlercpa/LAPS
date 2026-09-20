"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { saveQuizConfigAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { asQuizConfig, quizMaxScore, cryptoId, type QuizConfig } from "@/lib/leadmagnets/quiz";

export function QuizBuilder({ magnetId, initial }: { magnetId: string; initial: unknown }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cfg, setCfg] = useState<QuizConfig>(asQuizConfig(initial));

  const patch = (next: Partial<QuizConfig>) => setCfg((c) => ({ ...c, ...next }));
  const max = quizMaxScore(cfg);

  // Questions
  const addQuestion = () => patch({ questions: [...cfg.questions, { id: cryptoId(), prompt: "", options: [{ id: cryptoId(), label: "", weight: 0 }] }] });
  const updateQuestion = (qi: number, prompt: string) => patch({ questions: cfg.questions.map((q, i) => (i === qi ? { ...q, prompt } : q)) });
  const removeQuestion = (qi: number) => patch({ questions: cfg.questions.filter((_, i) => i !== qi) });
  const addOption = (qi: number) => patch({ questions: cfg.questions.map((q, i) => (i === qi ? { ...q, options: [...q.options, { id: cryptoId(), label: "", weight: 0 }] } : q)) });
  const updateOption = (qi: number, oi: number, field: "label" | "weight", value: string) =>
    patch({
      questions: cfg.questions.map((q, i) =>
        i !== qi ? q : { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, [field]: field === "weight" ? Number(value) || 0 : value } : o)) },
      ),
    });
  const removeOption = (qi: number, oi: number) =>
    patch({ questions: cfg.questions.map((q, i) => (i !== qi ? q : { ...q, options: q.options.filter((_, j) => j !== oi) })) });

  // Bands
  const addBand = () => patch({ bands: [...cfg.bands, { key: cryptoId(), label: "", min: 0, max, headline: "", body: "", recommendations: [] }] });
  const updateBand = (bi: number, field: string, value: string) =>
    patch({ bands: cfg.bands.map((b, i) => (i === bi ? { ...b, [field]: field === "min" || field === "max" ? Number(value) || 0 : value } : b)) });
  const updateBandRecs = (bi: number, text: string) =>
    patch({ bands: cfg.bands.map((b, i) => (i === bi ? { ...b, recommendations: text.split("\n").map((s) => s.trim()).filter(Boolean) } : b)) });
  const removeBand = (bi: number) => patch({ bands: cfg.bands.filter((_, i) => i !== bi) });

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await saveQuizConfigAction(magnetId, cfg);
      setMsg(res.ok ? "Quiz saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="card space-y-5 p-4">
      <div className="flex items-center justify-between">
        <div className="micro-label">Quiz builder</div>
        <span className="tag tag-neutral">Max score {max}</span>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {cfg.questions.map((q, qi) => (
          <div key={q.id} className="rounded-sm border border-divider p-3">
            <div className="mb-2 flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted" />
              <input className="input flex-1" value={q.prompt} placeholder={`Question ${qi + 1}`} onChange={(e) => updateQuestion(qi, e.target.value)} />
              <button className="btn btn-ghost btn-icon text-accent-700" onClick={() => removeQuestion(qi)} aria-label="Remove question"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5 pl-6">
              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input className="input flex-1 text-[13px]" value={o.label} placeholder={`Answer ${oi + 1}`} onChange={(e) => updateOption(qi, oi, "label", e.target.value)} />
                  <input className="input w-20 text-right text-[13px]" type="number" value={o.weight} title="Score weight" onChange={(e) => updateOption(qi, oi, "weight", e.target.value)} />
                  <button className="btn btn-ghost btn-icon" onClick={() => removeOption(qi, oi)} aria-label="Remove answer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button className="btn btn-ghost text-[12px]" onClick={() => addOption(qi)}><Plus className="h-3.5 w-3.5" /> Answer</button>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addQuestion}><Plus className="h-4 w-4" /> Add question</button>
      </div>

      {/* Bands */}
      <div>
        <div className="micro-label mb-2">Result bands (score → archetype)</div>
        <div className="space-y-3">
          {cfg.bands.map((b, bi) => (
            <div key={b.key} className="rounded-sm border border-divider p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input className="input flex-1 min-w-[160px]" value={b.label} placeholder="Band label (e.g. Exit-Ready)" onChange={(e) => updateBand(bi, "label", e.target.value)} />
                <label className="flex items-center gap-1 text-[12px] text-muted">min <input className="input w-20 text-right" type="number" value={b.min} onChange={(e) => updateBand(bi, "min", e.target.value)} /></label>
                <label className="flex items-center gap-1 text-[12px] text-muted">max <input className="input w-20 text-right" type="number" value={b.max} onChange={(e) => updateBand(bi, "max", e.target.value)} /></label>
                <button className="btn btn-ghost btn-icon text-accent-700" onClick={() => removeBand(bi)} aria-label="Remove band"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input className="input mb-1.5" value={b.headline ?? ""} placeholder="Results headline" onChange={(e) => updateBand(bi, "headline", e.target.value)} />
              <textarea className="input mb-1.5 min-h-[60px]" value={b.body ?? ""} placeholder="What this result means…" onChange={(e) => updateBand(bi, "body", e.target.value)} />
              <textarea className="input min-h-[60px] text-[13px]" value={(b.recommendations ?? []).join("\n")} placeholder="Recommendations — one per line" onChange={(e) => updateBandRecs(bi, e.target.value)} />
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addBand}><Plus className="h-4 w-4" /> Add band</button>
        </div>
      </div>

      {/* Results CTA */}
      <label className="field">
        <span className="micro-label">Results CTA → booking slug (optional)</span>
        <input className="input" value={cfg.bookingSlug ?? ""} placeholder="e.g. discovery-call" onChange={(e) => patch({ bookingSlug: e.target.value || undefined })} />
      </label>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>Save quiz</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  );
}
