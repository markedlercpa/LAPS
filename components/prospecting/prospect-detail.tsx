"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Plus, Trash2 } from "lucide-react";
import type { ProspectResearchStatus } from "@prisma/client";
import { updateProspectResearch, addProspectTouch, deleteProspectTouch, setResearchStatus } from "@/app/(dashboard)/prospecting/actions";
import { RESEARCH_STATUS_LABELS } from "@/components/prospecting/prospects-table";

export type ProspectDetailData = {
  id: string;
  companyName: string;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  tier: string;
  revenueEstimate: number | null;
  headcountEstimate: number | null;
  researchStatus: ProspectResearchStatus;
  signal: string | null;
  fitNotes: string | null;
  tags: string[];
  notes: string | null;
  source: string | null;
  promotedLeadId: string | null;
};

export type TouchRow = { id: string; kind: string; body: string; who: string; occurredAt: string };

const KINDS = ["note", "research", "call", "email", "linkedin"] as const;

export function ProspectDetail({ p, touches, dupLeadId }: { p: ProspectDetailData; touches: TouchRow[]; dupLeadId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    contactName: p.contactName ?? "", title: p.title ?? "", email: p.email ?? "", phone: p.phone ?? "",
    website: p.website ?? "", linkedinUrl: p.linkedinUrl ?? "", industry: p.industry ?? "", tier: p.tier,
    revenueEstimate: p.revenueEstimate != null ? String(p.revenueEstimate) : "", headcountEstimate: p.headcountEstimate != null ? String(p.headcountEstimate) : "",
    signal: p.signal ?? "", fitNotes: p.fitNotes ?? "", tags: p.tags.join(", "), notes: p.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await updateProspectResearch({
        id: p.id, ...f,
        revenueEstimate: f.revenueEstimate === "" ? undefined : Number(f.revenueEstimate),
        headcountEstimate: f.headcountEstimate === "" ? undefined : Number(f.headcountEstimate),
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setMsg(res.ok ? "Saved." : res.error);
      if (res.ok) router.refresh();
    });
  };

  const setStatus = (rs: ProspectResearchStatus) => start(async () => { await setResearchStatus(p.id, rs); router.refresh(); });

  const addTouch = (fd: FormData) => start(async () => {
    const res = await addProspectTouch({ prospectId: p.id, kind: fd.get("kind"), body: fd.get("body") });
    if (res.ok) { (document.getElementById("touch-form") as HTMLFormElement | null)?.reset(); router.refresh(); }
    else setMsg(res.error);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        {dupLeadId && (
          <div className="rounded-sm border-l-2 border-accent bg-surface px-3 py-2 text-[13px]">
            ⚠ A lead with this email already exists in the pipeline. <Link className="text-accent-700" href={`/leads/${dupLeadId}`}>View lead →</Link> — avoid duplicating CRM work.
          </div>
        )}

        {/* Research status */}
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <span className="micro-label">Research status</span>
          {(Object.keys(RESEARCH_STATUS_LABELS) as ProspectResearchStatus[]).map((s) => (
            <button key={s} className={`btn ${p.researchStatus === s ? "btn-primary" : "btn-secondary"}`} disabled={pending} onClick={() => setStatus(s)}>
              {RESEARCH_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Research write-up */}
        <div className="card space-y-3 p-4">
          <div className="micro-label">Research</div>
          <label className="field"><span className="micro-label">Signal / why now</span>
            <input className="input" value={f.signal} onChange={(e) => set("signal", e.target.value)} placeholder="Raised a round · hiring a controller · owner near retirement…" /></label>
          <label className="field"><span className="micro-label">Fit notes / angle</span>
            <textarea className="input min-h-[140px]" value={f.fitNotes} onChange={(e) => set("fitNotes", e.target.value)} placeholder="Why they fit the ICP, the opening angle, account context, who to reach…" /></label>
          <label className="field"><span className="micro-label">Tags (comma-separated)</span>
            <input className="input" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="pe-backed, saas, dream100" /></label>
        </div>

        {/* Account & contact */}
        <div className="card space-y-3 p-4">
          <div className="micro-label">Account &amp; contact</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field"><span className="micro-label">Contact name</span><input className="input" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Title</span><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Email</span><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Phone</span><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Website</span><input className="input" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
            <label className="field"><span className="micro-label">LinkedIn</span><input className="input" value={f.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Industry</span><input className="input" value={f.industry} onChange={(e) => set("industry", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Tier</span>
              <select className="input" value={f.tier} onChange={(e) => set("tier", e.target.value)}>{["A", "B", "C"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className="field"><span className="micro-label">Est. revenue ($)</span><input className="input" type="number" value={f.revenueEstimate} onChange={(e) => set("revenueEstimate", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Headcount</span><input className="input" type="number" value={f.headcountEstimate} onChange={(e) => set("headcountEstimate", e.target.value)} /></label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={save} disabled={pending}><Save className="h-4 w-4" /> Save</button>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
        </div>
      </div>

      {/* Touch log */}
      <div className="space-y-4">
        <div className="card p-4">
          <div className="micro-label mb-2">Log a touch</div>
          <form id="touch-form" action={addTouch} className="space-y-2">
            <select name="kind" className="input" defaultValue="research">
              {KINDS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
            <textarea name="body" className="input min-h-[70px]" placeholder="What you found / did…" required />
            <button type="submit" className="btn btn-secondary w-full justify-center" disabled={pending}><Plus className="h-4 w-4" /> Add</button>
          </form>
        </div>

        <div className="card p-4">
          <div className="micro-label mb-2">Activity ({touches.length})</div>
          {touches.length === 0 ? (
            <p className="text-[13px] text-muted">No touches yet.</p>
          ) : (
            <ul className="space-y-3">
              {touches.map((t) => (
                <li key={t.id} className="border-l-2 border-divider pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted">{t.kind} · {t.who}</span>
                    <button className="btn-icon text-neutral-500 hover:text-accent" onClick={() => start(async () => { await deleteProspectTouch(t.id, p.id); router.refresh(); })} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="whitespace-pre-wrap text-[13px]">{t.body}</div>
                  <div className="text-[11px] text-muted">{t.occurredAt}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {p.promotedLeadId ? (
          <Link href={`/leads/${p.promotedLeadId}`} className="btn btn-secondary w-full justify-center">View promoted lead →</Link>
        ) : null}
      </div>
    </div>
  );
}
