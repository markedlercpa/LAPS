"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { importResourcesCsvAction } from "@/app/(dashboard)/work/capacity/actions";

/** Manual roster import (e.g. paste a Karbon export). No live connection. */
export function ImportResourcesButton({ bandNames }: { bandNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await importResourcesCsvAction(csv);
      if (res.ok) {
        setMsg(`Imported ${res.created} new, updated ${res.updated}${res.skipped.length ? `, skipped ${res.skipped.length}: ${res.skipped.slice(0, 5).join("; ")}` : ""}.`);
        if (res.created || res.updated) router.refresh();
      } else setMsg(res.error ?? "Import failed.");
    });

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import roster
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import roster (from Karbon export)">
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            Paste a CSV of your roster. Columns: <code>name, email, band, capacity, location, director</code>. The
            <strong> band</strong> must match an existing role band by name: {bandNames.join(", ") || "— none yet —"}.
            Existing people (by email) are updated. No Karbon connection — this is a one-time paste.
          </p>
          <textarea
            className="input font-mono text-[12px]"
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name, email, band, capacity, location, director\nJane Preparer, jane@edlerzain.com, Senior, 40, US, no\nCarlos Staff, carlos@edlerzain.com, Staff, 40, LatAm, no"}
          />
          {msg && <p className="text-[13px] text-accent-700">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Close</button>
            <button className="btn btn-primary" onClick={run} disabled={pending || !csv.trim()}>{pending ? "Importing…" : "Import"}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
