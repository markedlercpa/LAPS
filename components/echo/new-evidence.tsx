"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type {
  QoOPillar,
  EvidenceType,
  EvidenceSource,
  Consent,
} from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import {
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_LABELS,
  EVIDENCE_SOURCES,
  EVIDENCE_SOURCE_LABELS,
  CONSENTS,
  CONSENT_LABELS,
} from "@/lib/echo-taxonomy";
import { PillarPicker } from "./pillar-picker";
import { createEvidence } from "@/app/(dashboard)/echo/actions";

export function NewEvidence() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EvidenceType>("PAIN_POINT");
  const [source, setSource] = useState<EvidenceSource>("SALES_CALL");
  const [sourceRef, setSourceRef] = useState("");
  const [rawText, setRawText] = useState("");
  const [distilled, setDistilled] = useState("");
  const [clientRef, setClientRef] = useState("");
  const [consent, setConsent] = useState<Consent>("INTERNAL_ONLY");
  const [pillarTags, setPillarTags] = useState<QoOPillar[]>([]);
  const [icpFit, setIcpFit] = useState(false);
  const [strength, setStrength] = useState("3");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createEvidence({
        type,
        source,
        sourceRef,
        rawText,
        distilled,
        clientRef,
        consent,
        pillarTags,
        icpFit,
        strength,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setOpen(false);
        setRawText("");
        setDistilled("");
        setClientRef("");
        setSourceRef("");
        setPillarTags([]);
        router.refresh();
      }
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New evidence
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New evidence record">
        <div className="field space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Type</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>{EVIDENCE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Source</label>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value as EvidenceSource)}>
                {EVIDENCE_SOURCES.map((s) => (
                  <option key={s} value={s}>{EVIDENCE_SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>Source ref (transcript ID, deal ID, URL)</label>
            <input className="input" value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
          </div>
          <div>
            <label>Raw text (verbatim)</label>
            <textarea className="input" rows={3} value={rawText} onChange={(e) => setRawText(e.target.value)} />
          </div>
          <div>
            <label>Distilled (clean one-paragraph version)</label>
            <textarea className="input" rows={2} value={distilled} onChange={(e) => setDistilled(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Client ref (internal only)</label>
              <input className="input" value={clientRef} onChange={(e) => setClientRef(e.target.value)} />
            </div>
            <div>
              <label>Consent</label>
              <select className="input" value={consent} onChange={(e) => setConsent(e.target.value as Consent)}>
                {CONSENTS.map((c) => (
                  <option key={c} value={c}>{CONSENT_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Strength (1-5)</label>
              <input className="input" type="number" min={1} max={5} value={strength} onChange={(e) => setStrength(e.target.value)} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-[14px]" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={icpFit} onChange={(e) => setIcpFit(e.target.checked)} />
              <span>ICP fit</span>
            </label>
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
          <button className="btn btn-primary" onClick={submit} disabled={pending || !rawText}>
            {pending ? "Saving…" : "Save to vault"}
          </button>
        </div>
      </Modal>
    </>
  );
}
