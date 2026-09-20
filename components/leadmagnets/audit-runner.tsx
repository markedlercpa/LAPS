"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CalendarClock } from "lucide-react";
import { captureAuditAction, type AuditResult } from "@/app/lm/[slug]/actions";
import type { AuditConfig } from "@/lib/leadmagnets/audit";

export function AuditRunner({
  slug, body, ctaLabel, config, source, contentItemId,
}: {
  slug: string;
  body: string | null;
  ctaLabel: string;
  config: AuditConfig;
  source: string | null;
  contentItemId: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Extract<AuditResult, { ok: true }> | null>(null);
  const [contact, setContact] = useState<{ name: string; email: string } | null>(null);

  const setAns = (qid: string, v: string) => setAnswers((a) => ({ ...a, [qid]: v }));

  const submit = (fd: FormData) => {
    setError(null);
    // required questions
    for (const q of config.questions) {
      if (q.required && !answers[q.id]) { setError(`Please answer: ${q.prompt}`); return; }
    }
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    start(async () => {
      const res = await captureAuditAction({
        slug, email, name: name || null, company: String(fd.get("company") ?? "") || null,
        answers, source, contentItemId,
      });
      if (!res.ok) { setError(res.error); return; }
      setContact({ name, email });
      setResult(res);
    });
  };

  if (result) {
    if (result.qualified && result.bookingSlug) {
      const q = new URLSearchParams();
      if (contact?.name) q.set("name", contact.name);
      if (contact?.email) q.set("email", contact.email);
      const href = `/book/${result.bookingSlug}${q.toString() ? `?${q}` : ""}`;
      return (
        <div className="rounded-md border border-divider bg-surface p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-accent" />
          <h3 className="mb-1">You’re a great fit — let’s book your call.</h3>
          <p className="mb-4 text-[14px] text-muted">Pick a time that works and we’ll take it from there.</p>
          <a href={href} className="btn btn-primary"><CalendarClock className="h-4 w-4" /> Choose a time</a>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-divider bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-accent" />
        <h3 className="mb-1">Thanks — we’ve got your application.</h3>
        <p className="text-[14px] text-muted">{result.disqualifyMessage || "We’ll review it and be in touch if it’s a fit."}</p>
      </div>
    );
  }

  return (
    <>
      {(config.intro || body) && <div className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed">{config.intro || body}</div>}
      <form action={submit} className="space-y-4 rounded-md border border-divider bg-surface p-6">
        {config.questions.map((q) => (
          <div key={q.id} className="field">
            <span className="micro-label">{q.prompt}{q.required ? " *" : ""}</span>
            {q.type === "select" ? (
              <select className="input" value={answers[q.id] ?? ""} onChange={(e) => setAns(q.id, e.target.value)}>
                <option value="">Choose…</option>
                {(q.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <textarea className="input min-h-[70px]" value={answers[q.id] ?? ""} onChange={(e) => setAns(q.id, e.target.value)} />
            )}
          </div>
        ))}

        <div className="border-t border-divider pt-3">
          <label className="field"><span className="micro-label">Name</span><input name="name" className="input" placeholder="Your name" autoComplete="name" /></label>
          <label className="field mt-2"><span className="micro-label">Work email</span><input name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" /></label>
          <label className="field mt-2"><span className="micro-label">Company</span><input name="company" className="input" placeholder="Company (optional)" autoComplete="organization" /></label>
        </div>

        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>{pending ? "Submitting…" : ctaLabel}</button>
        {error && <p className="text-[12px] text-accent-700">{error}</p>}
      </form>
    </>
  );
}
