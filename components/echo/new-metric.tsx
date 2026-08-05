"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ContentChannel } from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import { CONTENT_CHANNELS, CONTENT_CHANNEL_LABELS } from "@/lib/echo-taxonomy";
import { createMetricSnapshot } from "@/app/(dashboard)/echo/optics/actions";

type ItemOption = { id: string; title: string };

const NUMERIC = [
  ["impressions", "Impressions"],
  ["engagements", "Engagements"],
  ["clicks", "Clicks"],
  ["conversions", "Conversions"],
] as const;

export function NewMetric({ items }: { items: ItemOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [contentItemId, setContentItemId] = useState("");
  const [channel, setChannel] = useState<ContentChannel | "">("");
  const [nums, setNums] = useState<Record<string, string>>({
    impressions: "",
    engagements: "",
    clicks: "",
    conversions: "",
  });
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createMetricSnapshot({
        contentItemId: contentItemId || undefined,
        channel: channel || undefined,
        impressions: nums.impressions || 0,
        engagements: nums.engagements || 0,
        clicks: nums.clicks || 0,
        conversions: nums.conversions || 0,
        note,
        source,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setOpen(false);
        setNums({ impressions: "", engagements: "", clicks: "", conversions: "" });
        setNote("");
        setSource("");
        router.refresh();
      }
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add snapshot
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record performance snapshot">
        <p className="text-[13px] text-muted">Manually aggregated numbers from wherever the piece ran.</p>
        <div className="mt-3 space-y-3">
          <div className="field">
            <label>Content (optional)</label>
            <select className="input" value={contentItemId} onChange={(e) => setContentItemId(e.target.value)}>
              <option value="">— Not tied to one piece —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.title}</option>
              ))}
            </select>
          </div>
          {!contentItemId && (
            <div className="field">
              <label>Channel (optional)</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as ContentChannel | "")}>
                <option value="">— Any —</option>
                {CONTENT_CHANNELS.map((c) => (
                  <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {NUMERIC.map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  className="input num"
                  inputMode="numeric"
                  value={nums[key]}
                  onChange={(e) => setNums((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <div className="field">
            <label>Source (where the numbers came from)</label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="LinkedIn analytics, email report…" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save snapshot"}
          </button>
        </div>
      </Modal>
    </>
  );
}
