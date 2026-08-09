"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createProspect, importProspectsCsv } from "@/app/(dashboard)/prospecting/actions";

export function ProspectingToolbar() {
  return (
    <div className="flex items-center gap-2">
      <ImportButton />
      <NewButton />
    </div>
  );
}

function ImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await importProspectsCsv(csv, source || undefined);
      if (res.ok) {
        setMsg(`Imported ${res.created}${res.skipped ? ` (${res.skipped} skipped)` : ""}.`);
        setCsv("");
        router.refresh();
      } else {
        setMsg(res.error ?? "Import failed.");
      }
    });

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import prospects (Dream 100)">
        <div className="space-y-3">
          <label className="field">
            <span className="micro-label">Batch / list name</span>
            <input className="input" placeholder="e.g. Dream 100 — Q3 SaaS" value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label className="field">
            <span className="micro-label">Rows (CSV)</span>
            <textarea
              className="input font-mono text-[12px]"
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"company, contact, title, email, phone, website, industry, tier, revenue, headcount\nAcme Manufacturing, Jane Doe, CFO, jane@acme.com, , acme.com, Manufacturing, A, 25000000, 120\nGlobex, , , , , globex.com, SaaS, B, 8000000, 45"}
            />
          </label>
          <p className="text-[12px] text-muted">
            Only <strong>company</strong> is required. A header row is auto-detected; otherwise columns are read in the order shown.
          </p>
          {msg && <p className="text-[13px] text-accent-700">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Close</button>
            <button className="btn btn-primary" onClick={run} disabled={pending || !csv.trim()}>
              {pending ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function NewButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ companyName: "", contactName: "", title: "", email: "", tier: "B", revenueEstimate: "", headcountEstimate: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  const submit = () =>
    startTransition(async () => {
      const res = await createProspect(v);
      if (res.ok) {
        setOpen(false);
        setV({ companyName: "", contactName: "", title: "", email: "", tier: "B", revenueEstimate: "", headcountEstimate: "" });
        router.refresh();
      } else setErr(res.error ?? "Failed");
    });

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New prospect
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New prospect">
        <div className="space-y-3">
          <label className="field"><span className="micro-label">Company *</span><input className="input" value={v.companyName} onChange={(e) => set("companyName", e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field"><span className="micro-label">Contact</span><input className="input" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Title</span><input className="input" value={v.title} onChange={(e) => set("title", e.target.value)} /></label>
          </div>
          <label className="field"><span className="micro-label">Email</span><input className="input" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="field"><span className="micro-label">Tier</span><select className="input" value={v.tier} onChange={(e) => set("tier", e.target.value)}><option>A</option><option>B</option><option>C</option></select></label>
            <label className="field"><span className="micro-label">Est. rev ($)</span><input className="input" type="number" value={v.revenueEstimate} onChange={(e) => set("revenueEstimate", e.target.value)} /></label>
            <label className="field"><span className="micro-label">Headcount</span><input className="input" type="number" value={v.headcountEstimate} onChange={(e) => set("headcountEstimate", e.target.value)} /></label>
          </div>
          {err && <p className="text-[13px] text-accent-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={pending || !v.companyName.trim()}>{pending ? "Saving…" : "Create"}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
