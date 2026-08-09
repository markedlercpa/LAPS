"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { captureQuizAction, type QuizResult } from "@/app/lm/[slug]/actions";
import type { QuizConfig } from "@/lib/leadmagnets/quiz";

type Stage = "intro" | "questions" | "contact" | "result";

export function QuizRunner({
  slug, headline, subhead, body, ctaLabel, config, source, contentItemId,
}: {
  slug: string;
  headline: string;
  subhead: string | null;
  body: string | null;
  ctaLabel: string;
  config: QuizConfig;
  source: string | null;
  contentItemId: string | null;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<QuizResult, { ok: true }> | null>(null);

  const questions = config.questions;
  const answeredAll = useMemo(() => questions.length > 0 && questions.every((q) => answers[q.id]), [questions, answers]);

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await captureQuizAction({
        slug,
        email: String(fd.get("email") ?? ""),
        name: String(fd.get("name") ?? "") || null,
        company: String(fd.get("company") ?? "") || null,
        answers,
        source,
        contentItemId,
      });
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
      setStage("result");
    });
  };

  // ── Results (printable) ──
  if (stage === "result" && result) {
    const pct = result.max > 0 ? Math.round((result.score / result.max) * 100) : 0;
    return (
      <div className="reader-panel">
        <div className="mb-4 flex items-center gap-2 text-accent"><CheckCircle2 className="h-5 w-5" /><span className="micro-label">Your result</span></div>
        <h1 className="mb-1">{result.band?.headline || result.band?.label || "Your score"}</h1>
        <p className="mb-4 text-[15px] text-muted">Score: <strong>{result.score}</strong> / {result.max} ({pct}%){result.band ? ` · ${result.band.label}` : ""}</p>
        {result.band?.body && <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">{result.band.body}</p>}
        {result.band?.recommendations && result.band.recommendations.length > 0 && (
          <div className="mb-6">
            <div className="micro-label mb-2">Recommended next steps</div>
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
              {result.band.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <div className="no-print flex flex-wrap gap-2">
          {result.bookingSlug && <a href={`/book/${result.bookingSlug}`} className="btn btn-primary">Book a call to review this</a>}
          <button className="btn btn-secondary" onClick={() => window.print()}>Save as PDF</button>
        </div>
      </div>
    );
  }

  // ── Contact gate ──
  if (stage === "contact") {
    return (
      <form action={submit} className="space-y-3 rounded-md border border-divider bg-surface p-6">
        <p className="mb-1 text-[14px] text-muted">You’re done — enter your details to see your result.</p>
        <label className="field"><span className="micro-label">Name</span><input name="name" className="input" placeholder="Your name" autoComplete="name" /></label>
        <label className="field"><span className="micro-label">Work email</span><input name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" /></label>
        <label className="field"><span className="micro-label">Company</span><input name="company" className="input" placeholder="Company (optional)" autoComplete="organization" /></label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setStage("questions")} disabled={pending}><ArrowLeft className="h-4 w-4" /> Back</button>
          <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={pending}>{pending ? "Scoring…" : "See my result"}</button>
        </div>
        {error && <p className="text-[12px] text-accent-700">{error}</p>}
        <p className="text-center text-[11px] text-muted">No spam. Unsubscribe anytime.</p>
      </form>
    );
  }

  // ── Questions ──
  if (stage === "questions" && questions.length > 0) {
    const q = questions[step];
    const isLast = step === questions.length - 1;
    return (
      <div className="rounded-md border border-divider bg-surface p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="micro-label">Question {step + 1} of {questions.length}</span>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-divider">
            <div className="h-full bg-accent" style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
          </div>
        </div>
        <h3 className="mb-3">{q.prompt}</h3>
        <div className="space-y-2">
          {q.options.map((o) => (
            <button
              key={o.id}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
              className={`block w-full rounded-sm border px-3 py-2 text-left text-[14px] ${answers[q.id] === o.id ? "border-accent bg-accent-100" : "border-divider hover:border-ink/30"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button className="btn btn-ghost" onClick={() => (step === 0 ? setStage("intro") : setStep(step - 1))}><ArrowLeft className="h-4 w-4" /> Back</button>
          {isLast ? (
            <button className="btn btn-primary" disabled={!answeredAll} onClick={() => setStage("contact")}>See my result <ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button className="btn btn-primary" disabled={!answers[q.id]} onClick={() => setStep(step + 1)}>Next <ArrowRight className="h-4 w-4" /></button>
          )}
        </div>
      </div>
    );
  }

  // ── Intro ──
  return (
    <div>
      {body && <div className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed">{body}</div>}
      <button
        className="btn btn-primary"
        onClick={() => setStage(questions.length ? "questions" : "contact")}
      >
        {ctaLabel}
      </button>
      {questions.length === 0 && <p className="mt-2 text-[12px] text-muted">This quiz has no questions yet.</p>}
    </div>
  );
}
