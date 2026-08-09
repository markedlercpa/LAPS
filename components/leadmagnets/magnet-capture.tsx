"use client";

import { useState, useTransition } from "react";
import { Download, CheckCircle2 } from "lucide-react";
import { captureMagnetAction } from "@/app/lm/[slug]/actions";

/** Public email-capture form for a lead magnet. On success (download kinds)
 * it reveals the download link; other kinds just confirm. */
export function MagnetCapture({
  slug, kind, ctaLabel, source, contentItemId, isDownload,
}: {
  slug: string;
  kind: string;
  ctaLabel: string;
  source: string | null;
  contentItemId: string | null;
  isDownload: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string | null; fileName: string | null } | null>(null);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await captureMagnetAction({
        slug,
        email: String(fd.get("email") ?? ""),
        name: String(fd.get("name") ?? "") || null,
        company: String(fd.get("company") ?? "") || null,
        source,
        contentItemId,
      });
      if (!res.ok) { setError(res.error); return; }
      setDone({ url: res.download?.url ?? null, fileName: res.download?.fileName ?? null });
    });
  }

  if (done) {
    return (
      <div className="rounded-md border border-divider bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-accent" />
        <h3 className="mb-1">You’re all set{isDownload ? "" : " — check your inbox"}.</h3>
        {isDownload && done.url ? (
          <>
            <p className="mb-4 text-[14px] text-muted">Your download is ready. We also emailed you the link.</p>
            <a href={done.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <Download className="h-4 w-4" /> Download{done.fileName ? ` ${done.fileName}` : ""}
            </a>
          </>
        ) : (
          <p className="text-[14px] text-muted">We’ll be in touch shortly.</p>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-md border border-divider bg-surface p-6">
      <label className="field">
        <span className="micro-label">Name</span>
        <input name="name" className="input" placeholder="Your name" autoComplete="name" />
      </label>
      <label className="field">
        <span className="micro-label">Work email</span>
        <input name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" />
      </label>
      <label className="field">
        <span className="micro-label">Company</span>
        <input name="company" className="input" placeholder="Company (optional)" autoComplete="organization" />
      </label>
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : ctaLabel}
      </button>
      {error && <p className="text-[12px] text-accent-700">{error}</p>}
      <p className="text-center text-[11px] text-muted">No spam. Unsubscribe anytime.</p>
    </form>
  );
}
