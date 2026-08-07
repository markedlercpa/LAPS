"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Link2, X, Repeat, AlertTriangle } from "lucide-react";
import type {
  ContentChannel,
  ContentStatus,
  QoOPillar,
  EvidenceType,
  CardCategory,
} from "@prisma/client";
import {
  CONTENT_CHANNELS,
  CONTENT_CHANNEL_LABELS,
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
} from "@/lib/echo-taxonomy";
import { PillarPicker } from "./pillar-picker";
import {
  updateContentItem,
  toggleEvidenceLink,
  toggleCardLink,
  repurposeContentItem,
} from "@/app/(dashboard)/marketing/content/actions";

type EvidenceRef = { id: string; label: string; type: EvidenceType };
type CardRef = { id: string; text: string; category: CardCategory };

export function ContentEditor({
  item,
  linkedEvidence,
  linkedCards,
  allEvidence,
  allCards,
  modules,
  source,
  derivatives,
  bannedPhrases,
}: {
  item: {
    id: string;
    title: string;
    channel: ContentChannel;
    status: ContentStatus;
    summary: string | null;
    body: string;
    pillarTags: QoOPillar[];
    moduleId: string | null;
    publishedUrl: string | null;
    publishedAt: string | null;
  };
  linkedEvidence: EvidenceRef[];
  linkedCards: CardRef[];
  allEvidence: EvidenceRef[];
  allCards: CardRef[];
  modules: { id: string; name: string }[];
  source: { id: string; title: string } | null;
  derivatives: { id: string; title: string; channel: ContentChannel }[];
  bannedPhrases: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [title, setTitle] = useState(item.title);
  const [channel, setChannel] = useState<ContentChannel>(item.channel);
  const [status, setStatus] = useState<ContentStatus>(item.status);
  const [moduleId, setModuleId] = useState(item.moduleId ?? "");
  const [summary, setSummary] = useState(item.summary ?? "");
  const [body, setBody] = useState(item.body);
  const [pillarTags, setPillarTags] = useState<QoOPillar[]>(item.pillarTags);
  const [publishedUrl, setPublishedUrl] = useState(item.publishedUrl ?? "");

  // Keep fields in sync when server data changes (e.g. after a link refresh).
  useEffect(() => setTitle(item.title), [item.title]);
  useEffect(() => setStatus(item.status), [item.status]);
  useEffect(() => setPublishedUrl(item.publishedUrl ?? ""), [item.publishedUrl]);

  const combined = `${title} ${summary} ${body}`.toLowerCase();
  const bannedHits = bannedPhrases.filter((b) => combined.includes(b.toLowerCase()));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateContentItem({
        id: item.id,
        title,
        channel,
        status,
        moduleId: moduleId || null,
        summary,
        body,
        pillarTags,
        publishedUrl: publishedUrl || null,
      });
      if (!res.ok) setError(res.error ?? "Save failed");
      else {
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    });
  };

  const linkedEvidenceIds = new Set(linkedEvidence.map((e) => e.id));
  const linkedCardIds = new Set(linkedCards.map((c) => c.id));
  const availEvidence = allEvidence.filter((e) => !linkedEvidenceIds.has(e.id));
  const availCards = allCards.filter((c) => !linkedCardIds.has(c.id));

  const link = (fn: () => Promise<unknown>) => startTransition(async () => {
    await fn();
    router.refresh();
  });

  const repurpose = (toChannel: ContentChannel) =>
    startTransition(async () => {
      const res = await repurposeContentItem(item.id, toChannel);
      if (res.ok) router.push(`/marketing/content/${res.id}`);
      else setError(res.error ?? "Repurpose failed");
    });

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 max-lg:grid-cols-1">
      {/* Main editor */}
      <div>
        <input
          className="input mb-3 !text-[22px] font-heading font-extrabold"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />

        {bannedHits.length > 0 && (
          <div className="mb-3 flex items-start gap-2 border-2 border-accent bg-accent-100 p-3 text-[13px] text-accent-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Contains retired/banned language: “{bannedHits.join("”, “")}”. Remove it before saving.
            </span>
          </div>
        )}

        <div className="field mb-3">
          <label>Summary / hook</label>
          <textarea
            className="input"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line hook or summary…"
          />
        </div>

        <div className="field">
          <label>Body</label>
          <textarea
            className="input"
            style={{ minHeight: 340 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the piece…"
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={pending || bannedHits.length > 0}
          >
            <Save className="h-4 w-4" />
            {pending ? "Saving…" : "Save"}
          </button>
          {savedAt && <span className="text-[13px] text-muted">Saved {savedAt}</span>}
          {error && <span className="text-[13px] text-accent-700">{error}</span>}
        </div>
      </div>

      {/* Sidebar: meta + traceability */}
      <div className="space-y-5">
        <div className="space-y-3 border-2 border-divider bg-surface p-3">
          <div className="field">
            <label>Channel</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as ContentChannel)}>
              {CONTENT_CHANNELS.map((c) => (
                <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)}>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          {modules.length > 0 && (
            <div className="field">
              <label>Module</label>
              <select className="input" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                <option value="">None</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Published URL</label>
            <input className="input" value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-muted">QoO pillars</label>
            <PillarPicker value={pillarTags} onChange={setPillarTags} />
          </div>
        </div>

        {/* Traceability: evidence */}
        <div className="border-2 border-divider bg-surface p-3">
          <div className="flex items-center justify-between">
            <div className="micro-label">Evidence ({linkedEvidence.length})</div>
            <Link2 className="h-4 w-4 text-neutral-500" />
          </div>
          {linkedEvidence.length === 0 && (
            <p className="mt-1 text-[12px] text-accent-700">
              Not traceable yet — link at least one evidence record.
            </p>
          )}
          <ul className="mt-2 space-y-1">
            {linkedEvidence.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 text-[12px]">
                <span className="min-w-0"><span className="text-muted">{e.type}</span> — {e.label}</span>
                <button
                  className="btn-icon shrink-0 text-neutral-500 hover:text-accent"
                  onClick={() => link(() => toggleEvidenceLink(item.id, e.id, false))}
                  disabled={pending}
                  aria-label="Unlink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {availEvidence.length > 0 && (
            <select
              className="input mt-2 text-[12px]"
              value=""
              onChange={(e) => e.target.value && link(() => toggleEvidenceLink(item.id, e.target.value, true))}
              disabled={pending}
            >
              <option value="">+ Link evidence…</option>
              {availEvidence.map((e) => (
                <option key={e.id} value={e.id}>{e.type} — {e.label.slice(0, 60)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Calling cards */}
        <div className="border-2 border-divider bg-surface p-3">
          <div className="micro-label">Calling cards ({linkedCards.length})</div>
          <ul className="mt-2 space-y-1">
            {linkedCards.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-[12px]">
                <span className="min-w-0">“{c.text.slice(0, 70)}”</span>
                <button
                  className="btn-icon shrink-0 text-neutral-500 hover:text-accent"
                  onClick={() => link(() => toggleCardLink(item.id, c.id, false))}
                  disabled={pending}
                  aria-label="Unlink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {availCards.length > 0 && (
            <select
              className="input mt-2 text-[12px]"
              value=""
              onChange={(e) => e.target.value && link(() => toggleCardLink(item.id, e.target.value, true))}
              disabled={pending}
            >
              <option value="">+ Link card…</option>
              {availCards.map((c) => (
                <option key={c.id} value={c.id}>{c.text.slice(0, 60)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Repurpose */}
        <div className="border-2 border-divider bg-surface p-3">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-neutral-500" />
            <div className="micro-label">Repurpose to…</div>
          </div>
          <select
            className="input mt-2 text-[13px]"
            value=""
            onChange={(e) => e.target.value && repurpose(e.target.value as ContentChannel)}
            disabled={pending}
          >
            <option value="">Choose channel…</option>
            {CONTENT_CHANNELS.filter((c) => c !== channel).map((c) => (
              <option key={c} value={c}>{CONTENT_CHANNEL_LABELS[c]}</option>
            ))}
          </select>
          {source && (
            <p className="mt-2 text-[12px] text-muted">
              Repurposed from{" "}
              <Link href={`/marketing/content/${source.id}`} className="text-accent-700">{source.title}</Link>
            </p>
          )}
          {derivatives.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] uppercase tracking-[.08em] text-neutral-600">Derivatives</div>
              {derivatives.map((d) => (
                <Link key={d.id} href={`/marketing/content/${d.id}`} className="mt-1 block text-[12px] text-accent-700">
                  {CONTENT_CHANNEL_LABELS[d.channel]} — {d.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
