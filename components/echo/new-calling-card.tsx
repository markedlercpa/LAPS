"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { QoOPillar, CardCategory, CardStatus } from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import {
  CARD_CATEGORIES,
  CARD_CATEGORY_LABELS,
  CARD_STATUSES,
  CARD_STATUS_LABELS,
} from "@/lib/echo-taxonomy";
import { PillarPicker } from "./pillar-picker";
import { createCallingCard } from "@/app/(dashboard)/echo/actions";

export function NewCallingCard({ bannedPhrases }: { bannedPhrases: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [cardText, setCardText] = useState("");
  const [category, setCategory] = useState<CardCategory>("HOOK");
  const [status, setStatus] = useState<CardStatus>("CANDIDATE");
  const [pillarTags, setPillarTags] = useState<QoOPillar[]>([]);

  // Live banned-phrase warning as they type.
  const lower = cardText.toLowerCase();
  const hits = bannedPhrases.filter((b) => lower.includes(b.toLowerCase()));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCallingCard({ cardText, category, status, pillarTags });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setOpen(false);
        setCardText("");
        setPillarTags([]);
        router.refresh();
      }
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New calling card
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New calling card">
        <div className="field space-y-3">
          <div>
            <label>Card text (the repeatable language)</label>
            <textarea
              className="input"
              rows={3}
              value={cardText}
              onChange={(e) => setCardText(e.target.value)}
            />
            {hits.length > 0 && (
              <p className="mt-1 text-[13px] text-accent-700">
                ⚠ Contains retired/banned language: “{hits.join("”, “")}”. This can&apos;t be saved.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Category</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CardCategory)}>
                {CARD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CARD_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as CardStatus)}>
                {CARD_STATUSES.map((s) => (
                  <option key={s} value={s}>{CARD_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>QoO pillars</label>
            <PillarPicker value={pillarTags} onChange={setPillarTags} />
          </div>
        </div>
        {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={pending || !cardText || hits.length > 0}
          >
            {pending ? "Saving…" : "Save card"}
          </button>
        </div>
      </Modal>
    </>
  );
}
