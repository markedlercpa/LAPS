"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ExternalLink, Trash2, Clock, Video } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  saveEventType,
  toggleEventActive,
  deleteEventType,
} from "@/app/(dashboard)/scheduling/actions";

type Question = { id: string; label: string; type: "text" | "textarea" | "phone"; required: boolean };

export type EventTypeData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMin: number;
  locationType: "ZOOM" | "PHONE" | "IN_PERSON" | "CUSTOM";
  location: string | null;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  rollingDays: number;
  windowBusinessDays: number | null;
  maxPerDay: number | null;
  active: boolean;
  questions: Question[];
};

const LOCATION_LABELS: Record<EventTypeData["locationType"], string> = {
  ZOOM: "Zoom",
  PHONE: "Phone",
  IN_PERSON: "In person",
  CUSTOM: "Custom",
};

const blank = (): EventTypeData => ({
  id: "",
  slug: "",
  name: "",
  description: "",
  durationMin: 30,
  locationType: "ZOOM",
  location: "",
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 240,
  rollingDays: 60,
  windowBusinessDays: 10,
  maxPerDay: null,
  active: true,
  questions: [],
});

let qid = 0;

export function EventTypeManager({
  events,
  hostSlug,
  baseUrl,
}: {
  events: EventTypeData[];
  hostSlug: string;
  baseUrl: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EventTypeData | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const res = await saveEventType({
        ...editing,
        id: editing.id || undefined,
        maxPerDay: editing.maxPerDay ?? undefined,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setEditing(null);
        router.refresh();
      }
    });
  };

  const toggle = (id: string, active: boolean) =>
    startTransition(async () => {
      await toggleEventActive(id, active);
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      await deleteEventType(id);
      router.refresh();
    });

  const set = <K extends keyof EventTypeData>(k: K, v: EventTypeData[K]) =>
    setEditing((e) => (e ? { ...e, [k]: v } : e));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="micro-label">Event types</div>
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          <Plus className="h-4 w-4" /> New event type
        </button>
      </div>

      {events.length === 0 ? (
        <div className="border-2 border-divider bg-surface p-6 text-center text-muted">
          No event types yet. Create one people can book.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {events.map((ev) => (
            <div key={ev.id} className="border-2 border-divider bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-heading text-[17px] font-extrabold">{ev.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{ev.durationMin} min</span>
                    <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />{LOCATION_LABELS[ev.locationType]}</span>
                    <span className={`tag ${ev.active ? "tag-accent" : "tag-neutral"}`}>{ev.active ? "Live" : "Off"}</span>
                  </div>
                </div>
              </div>
              {ev.description && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{ev.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn btn-secondary text-[13px]" onClick={() => setEditing({ ...ev, description: ev.description ?? "", location: ev.location ?? "" })}>Edit</button>
                <a className="btn btn-ghost text-[13px]" href={`${baseUrl}/book/${hostSlug}/${ev.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
                <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
                  <input type="checkbox" checked={ev.active} onChange={(e) => toggle(ev.id, e.target.checked)} /> Live
                </label>
                <button className="btn-icon text-neutral-500 hover:text-accent" onClick={() => remove(ev.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit event type" : "New event type"}>
          <div className="space-y-3">
            <div className="field">
              <label>Name</label>
              <input className="input" value={editing.name} onChange={(e) => set("name", e.target.value)} placeholder="Intro Call" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea className="input" rows={2} value={editing.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>Duration (min)</label>
                <input className="input num" inputMode="numeric" value={editing.durationMin} onChange={(e) => set("durationMin", Number(e.target.value) || 0)} />
              </div>
              <div className="field">
                <label>Location</label>
                <select className="input" value={editing.locationType} onChange={(e) => set("locationType", e.target.value as EventTypeData["locationType"])}>
                  {(["ZOOM", "PHONE", "IN_PERSON", "CUSTOM"] as const).map((l) => (
                    <option key={l} value={l}>{LOCATION_LABELS[l]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Location detail (optional — defaults to your Zoom link)</label>
              <input className="input" value={editing.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="https://zoom.us/j/… or a phone number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>Buffer before (min)</label>
                <input className="input num" inputMode="numeric" value={editing.bufferBeforeMin} onChange={(e) => set("bufferBeforeMin", Number(e.target.value) || 0)} />
              </div>
              <div className="field">
                <label>Buffer after (min)</label>
                <input className="input num" inputMode="numeric" value={editing.bufferAfterMin} onChange={(e) => set("bufferAfterMin", Number(e.target.value) || 0)} />
              </div>
              <div className="field">
                <label>Min notice (min)</label>
                <input className="input num" inputMode="numeric" value={editing.minNoticeMin} onChange={(e) => set("minNoticeMin", Number(e.target.value) || 0)} />
              </div>
              <div className="field">
                <label>Window (business days, blank = use calendar)</label>
                <input className="input num" inputMode="numeric" value={editing.windowBusinessDays ?? ""} placeholder="10" onChange={(e) => set("windowBusinessDays", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="field">
                <label>Window (calendar days)</label>
                <input className="input num" inputMode="numeric" value={editing.rollingDays} onChange={(e) => set("rollingDays", Number(e.target.value) || 1)} />
              </div>
              <div className="field">
                <label>Max / day (blank = ∞)</label>
                <input className="input num" inputMode="numeric" value={editing.maxPerDay ?? ""} onChange={(e) => set("maxPerDay", e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>

            {/* Screening questions */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] text-muted">Screening questions</label>
                <button
                  className="btn btn-ghost text-[13px]"
                  onClick={() => set("questions", [...editing.questions, { id: `q${++qid}`, label: "", type: "text", required: false }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add question
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {editing.questions.map((q, i) => (
                  <div key={q.id} className="flex items-center gap-2 border border-divider bg-bg p-2">
                    <input
                      className="input !min-h-[32px] py-1 text-[13px]"
                      value={q.label}
                      placeholder="Question…"
                      onChange={(e) => set("questions", editing.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <select
                      className="input !min-h-[32px] !w-auto py-1 text-[13px]"
                      value={q.type}
                      onChange={(e) => set("questions", editing.questions.map((x, j) => (j === i ? { ...x, type: e.target.value as Question["type"] } : x)))}
                    >
                      <option value="text">Short</option>
                      <option value="textarea">Long</option>
                      <option value="phone">Phone</option>
                    </select>
                    <label className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
                      <input type="checkbox" checked={q.required} onChange={(e) => set("questions", editing.questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> Req
                    </label>
                    <button className="btn-icon text-neutral-500 hover:text-accent" onClick={() => set("questions", editing.questions.filter((_, j) => j !== i))} aria-label="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={pending || !editing.name}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
