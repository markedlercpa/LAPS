"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  TRUST_SIGNAL_KINDS,
  TRUST_SIGNAL_LABELS,
  TRUST_SIGNAL_WEIGHTS,
  TRUST_SCORE_MAX,
  trustBand,
  type TrustSignalKind,
} from "@/lib/trust-taxonomy";
import { addLeadTrustSignal } from "@/app/(dashboard)/leads/actions";

export type TrustSignalRow = {
  id: string;
  kind: TrustSignalKind;
  weight: number;
  note: string | null;
  source: string | null;
  occurredAt: string;
};

/**
 * Lead detail trust panel: the ECHO→LAPS handoff made visible. Shows the
 * cached score + warmth band, the signal history, and a manual add form.
 * (Agents add signals via /api/agent/echo/trust; humans use this form.)
 */
export function LeadTrustPanel({
  leadId,
  score,
  signals,
}: {
  leadId: string;
  score: number;
  signals: TrustSignalRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<TrustSignalKind>("CONTENT_ENGAGE");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const band = trustBand(score);
  const pct = Math.round((Math.min(score, TRUST_SCORE_MAX) / TRUST_SCORE_MAX) * 100);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await addLeadTrustSignal({ leadId, kind, note });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setAdding(false);
        setNote("");
        router.refresh();
      }
    });
  };

  return (
    <div className="border-2 border-divider bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="micro-label">Trust score — earned in ECHO</div>
        <span className={`tag ${band.tag}`}>{band.label}</span>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="font-heading text-[38px] font-extrabold leading-none [font-variant-numeric:tabular-nums]">
          {score}
        </div>
        <div className="mb-1 text-[13px] text-muted">/ {TRUST_SCORE_MAX}</div>
      </div>
      <div className="mt-2 h-2 w-full bg-neutral-200">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="micro-label">Signals ({signals.length})</div>
        {!adding && (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add signal
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 space-y-2 border border-divider bg-bg p-3">
          <div className="field">
            <label>Signal</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as TrustSignalKind)}
            >
              {TRUST_SIGNAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TRUST_SIGNAL_LABELS[k]} (+{TRUST_SIGNAL_WEIGHTS[k]})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Which content / context…"
            />
          </div>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {signals.length > 0 && (
        <ul className="mt-3 space-y-2">
          {signals.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2 text-[13px]">
              <div className="min-w-0">
                <span className="font-medium">{TRUST_SIGNAL_LABELS[s.kind]}</span>
                {s.note && <span className="text-muted"> — {s.note}</span>}
              </div>
              <span className="shrink-0 text-muted [font-variant-numeric:tabular-nums]">
                +{s.weight}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
