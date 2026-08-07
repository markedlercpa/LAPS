"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ContentChannel } from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import { CONTENT_CHANNELS, CONTENT_CHANNEL_LABELS } from "@/lib/echo-taxonomy";
import { createContentItem } from "@/app/(dashboard)/marketing/content/actions";

export function NewContent() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<ContentChannel>("LINKEDIN");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createContentItem({ title, channel });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setOpen(false);
        setTitle("");
        router.push(`/marketing/content/${res.id}`);
      }
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New content
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New content">
        <div className="space-y-3">
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Working title…"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Channel</label>
            <select
              className="input"
              value={channel}
              onChange={(e) => setChannel(e.target.value as ContentChannel)}
            >
              {CONTENT_CHANNELS.map((c) => (
                <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !title}>
            {pending ? "Creating…" : "Create & edit"}
          </button>
        </div>
      </Modal>
    </>
  );
}
