"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Upload, Trash2, ExternalLink } from "lucide-react";
import { updateMagnetAction, setMagnetStatusAction, deleteMagnetAction, uploadMagnetFileAction } from "@/app/(dashboard)/marketing/lead-magnets/actions";
import { isDownloadKind, STATUS_LABELS } from "@/lib/leadmagnets/taxonomy";

export type MagnetEditorData = {
  id: string;
  slug: string;
  kind: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  headline: string | null;
  subhead: string | null;
  body: string | null;
  ctaLabel: string | null;
  baseScore: number;
  downloadUrl: string | null;
  deliverByEmail: boolean;
  fileName: string | null;
  storageConfigured: boolean;
};

export function MagnetEditor({ m, publicUrl }: { m: MagnetEditorData; publicUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({
    title: m.title,
    headline: m.headline ?? "",
    subhead: m.subhead ?? "",
    body: m.body ?? "",
    ctaLabel: m.ctaLabel ?? "",
    baseScore: String(m.baseScore),
    downloadUrl: m.downloadUrl ?? "",
    deliverByEmail: m.deliverByEmail,
  });
  const isDownload = isDownloadKind(m.kind);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await updateMagnetAction({
        id: m.id,
        title: f.title,
        headline: f.headline || null,
        subhead: f.subhead || null,
        body: f.body || null,
        ctaLabel: f.ctaLabel || null,
        baseScore: f.baseScore,
        downloadUrl: f.downloadUrl || "",
        deliverByEmail: f.deliverByEmail,
      });
      setMsg(res.ok ? "Saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  const setStatus = (status: MagnetEditorData["status"]) =>
    start(async () => { await setMagnetStatusAction(m.id, status); router.refresh(); });

  const del = () => {
    if (!confirm("Delete this lead magnet and all its submissions?")) return;
    start(async () => { await deleteMagnetAction(m.id); router.push("/marketing/lead-magnets"); });
  };

  const upload = (fd: FormData) => {
    setMsg(null);
    fd.set("id", m.id);
    start(async () => {
      const res = await uploadMagnetFileAction(fd);
      setMsg(res.ok ? `Uploaded ${res.fileName}` : res.error);
      if (res.ok) router.refresh();
    });
  };

  const copyLink = () => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="space-y-6">
      {/* Status + public link */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="micro-label">Status</span>
          {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} disabled={pending}
              className={`btn ${m.status === s ? "btn-primary" : "btn-secondary"}`}>{STATUS_LABELS[s]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded-sm bg-surface px-2 py-1 text-[12px]">{publicUrl}</code>
          <button className="btn btn-ghost btn-icon" title="Copy link" onClick={copyLink}><Copy className="h-4 w-4" /></button>
          <a className="btn btn-ghost btn-icon" title="Open" href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
          {copied && <span className="text-[12px] text-accent">Copied</span>}
        </div>
      </div>

      {/* Landing copy */}
      <div className="card space-y-3 p-4">
        <div className="micro-label">Landing page</div>
        <label className="field"><span className="micro-label">Title (internal)</span>
          <input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className="field"><span className="micro-label">Headline</span>
          <input className="input" value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="What they get, in one line" /></label>
        <label className="field"><span className="micro-label">Subhead</span>
          <input className="input" value={f.subhead} onChange={(e) => set("subhead", e.target.value)} placeholder="One supporting sentence" /></label>
        <label className="field"><span className="micro-label">Body</span>
          <textarea className="input min-h-[140px]" value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Bullets / description of the resource" /></label>
        <div className="flex flex-wrap gap-3">
          <label className="field flex-1 min-w-[180px]"><span className="micro-label">CTA button label</span>
            <input className="input" value={f.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} placeholder="Download the guide" /></label>
          <label className="field"><span className="micro-label">Lead score</span>
            <input type="number" min="0" max="500" className="input w-24 text-right" value={f.baseScore} onChange={(e) => set("baseScore", e.target.value)} /></label>
        </div>
      </div>

      {/* Delivery (download kinds) */}
      {isDownload && (
        <div className="card space-y-3 p-4">
          <div className="micro-label">Download file</div>
          {m.fileName
            ? <p className="text-[13px]">Current file: <strong>{m.fileName}</strong></p>
            : <p className="text-[13px] text-muted">No file uploaded yet.</p>}
          {m.storageConfigured ? (
            <form action={upload} className="flex items-end gap-2">
              <label className="field flex-1"><span className="micro-label">Upload (max 50 MB)</span>
                <input name="file" type="file" className="input" required /></label>
              <button type="submit" className="btn btn-secondary" disabled={pending}><Upload className="h-4 w-4" /> Upload</button>
            </form>
          ) : (
            <p className="text-[12px] text-muted">S3 isn’t configured — use an external download URL below instead.</p>
          )}
          <label className="field"><span className="micro-label">…or external download URL</span>
            <input className="input" value={f.downloadUrl} onChange={(e) => set("downloadUrl", e.target.value)} placeholder="https://drive.google.com/…" /></label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={f.deliverByEmail} onChange={(e) => set("deliverByEmail", e.target.checked)} />
            Email the download link on capture
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>Save changes</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
        <button className="btn btn-ghost ml-auto text-accent-700" onClick={del} disabled={pending}><Trash2 className="h-4 w-4" /> Delete</button>
      </div>
    </div>
  );
}
