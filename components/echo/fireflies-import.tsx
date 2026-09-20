"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio, Check, Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  listFirefliesForImport,
  importFirefliesTranscript,
} from "@/app/(dashboard)/marketing/actions";

type Row = {
  id: string;
  title: string;
  date: string | null;
  durationMinutes: number | null;
  participants: string[];
  overview: string | null;
  imported: boolean;
};

/**
 * Fireflies import for the evidence vault. Rendered only when Fireflies is
 * configured. Lists recent transcripts and pulls each in as a raw evidence
 * candidate for distillation. Human-visible surface over the connector.
 */
export function FirefliesImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await listFirefliesForImport();
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't reach Fireflies.");
      setRows([]);
      return;
    }
    setRows(res.transcripts);
  };

  const openModal = () => {
    setOpen(true);
    void load();
  };

  const importOne = (id: string) => {
    setBusy(id);
    startTransition(async () => {
      const res = await importFirefliesTranscript(id);
      setBusy(null);
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, imported: true } : r)));
        router.refresh();
      } else {
        setError(res.error ?? "Import failed");
      }
    });
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={openModal}>
        <Radio className="h-4 w-4" />
        Import from Fireflies
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import from Fireflies">
        <p className="text-[13px] text-muted">
          Recent recorded calls. Import pulls the transcript in as a raw evidence
          candidate — distill and tag it afterward.
        </p>
        {error && <p className="mt-2 text-[13px] text-accent-700">{error}</p>}
        {loading ? (
          <p className="mt-4 text-[14px] text-muted">Loading transcripts…</p>
        ) : rows.length === 0 && !error ? (
          <p className="mt-4 text-[14px] text-muted">No recent transcripts found.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border border-divider bg-bg p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-heading text-[15px] font-extrabold">
                    {r.title}
                  </div>
                  <div className="micro-label mt-0.5 text-neutral-500">
                    {r.date ? new Date(r.date).toLocaleDateString() : "—"}
                    {r.durationMinutes ? ` · ${r.durationMinutes} min` : ""}
                    {r.participants.length ? ` · ${r.participants.length} people` : ""}
                  </div>
                  {r.overview && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.overview}</p>
                  )}
                </div>
                {r.imported ? (
                  <span className="tag tag-neutral shrink-0">
                    <Check className="mr-1 h-3 w-3" /> In vault
                  </span>
                ) : (
                  <button
                    className="btn btn-ghost shrink-0"
                    onClick={() => importOne(r.id)}
                    disabled={busy === r.id}
                  >
                    <Download className="h-4 w-4" />
                    {busy === r.id ? "Importing…" : "Import"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}
