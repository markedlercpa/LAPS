"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createMagnetAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { KIND_LABELS, DEFAULT_BASE_SCORE, isLiveKind, type LeadMagnetKindKey } from "@/lib/leadmagnets/taxonomy";

const KIND_ORDER: LeadMagnetKindKey[] = ["EBOOK", "TEMPLATE", "TOOL", "QUIZ", "CALCULATOR", "AUDIT_CALL", "QBO_SNAPSHOT", "WEBINAR", "EMAIL_COURSE"];

export function MagnetCreate() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<LeadMagnetKindKey>("EBOOK");

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await createMagnetAction({
        title: fd.get("title"),
        kind: fd.get("kind"),
        baseScore: fd.get("baseScore"),
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(`/marketing/lead-magnets/${res.id}`);
    });
  }

  return (
    <form action={submit} className="card mb-6 flex flex-wrap items-end gap-2 p-4">
      <label className="field flex-1 min-w-[200px]">
        <span className="micro-label">Title</span>
        <input name="title" className="input" required placeholder="The SMB Owner’s Exit-Readiness Guide" />
      </label>
      <label className="field min-w-[200px]">
        <span className="micro-label">Type</span>
        <select
          name="kind"
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value as LeadMagnetKindKey)}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}{isLiveKind(k) ? "" : " (coming soon)"}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="micro-label">Lead score</span>
        <input name="baseScore" type="number" min="0" max="500" className="input w-24 text-right" defaultValue={DEFAULT_BASE_SCORE[kind]} key={kind} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}><Plus className="h-4 w-4" /> New magnet</button>
      {error && <span className="pb-2 text-[12px] text-accent-700">{error}</span>}
      {!isLiveKind(kind) && (
        <span className="w-full text-[12px] text-muted">
          {KIND_LABELS[kind]} magnets are scaffolded — you can create and configure one now; the interactive flow ships in a later phase. Downloads (e-book / template / tool) are fully live.
        </span>
      )}
    </form>
  );
}
