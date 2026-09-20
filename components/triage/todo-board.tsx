"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Trash2 } from "lucide-react";
import type { GtdBucket } from "@prisma/client";
import { SegToggle } from "@/components/ui/seg";
import { createTask, updateTask, setTaskDone, deleteTask } from "@/app/(dashboard)/tasks/actions";
import { formatDate } from "@/lib/utils";

export type TaskRow = {
  id: string;
  description: string;
  important: boolean;
  urgent: boolean;
  gtd: GtdBucket;
  context: string | null;
  dueDate: string | null;
  done: boolean;
};

export const GTD_LABELS: Record<GtdBucket, string> = {
  INBOX: "Inbox",
  NEXT: "Next actions",
  WAITING: "Waiting for",
  SCHEDULED: "Scheduled",
  SOMEDAY: "Someday / maybe",
};
const GTD_ORDER: GtdBucket[] = ["INBOX", "NEXT", "WAITING", "SCHEDULED", "SOMEDAY"];

const QUADRANTS = [
  { key: "do", title: "Do first", sub: "Important · Urgent", important: true, urgent: true, tone: "border-accent" },
  { key: "schedule", title: "Schedule", sub: "Important · Not urgent", important: true, urgent: false, tone: "border-ink" },
  { key: "delegate", title: "Delegate", sub: "Not important · Urgent", important: false, urgent: true, tone: "border-neutral-500" },
  { key: "later", title: "Eliminate / later", sub: "Not important · Not urgent", important: false, urgent: false, tone: "border-divider" },
] as const;

export function TodoBoard({ tasks, view }: { tasks: TaskRow[]; view: "matrix" | "gtd" }) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <QuickAdd />

      <div className="mb-5">
        <SegToggle
          param="view"
          defaultValue="matrix"
          options={[
            { value: "matrix", label: "Eisenhower matrix" },
            { value: "gtd", label: "GTD buckets" },
          ]}
        />
      </div>

      {view === "gtd" ? (
        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {GTD_ORDER.map((b) => (
            <div key={b}>
              <div className="mb-2 flex items-center justify-between">
                <span className="micro-label">{GTD_LABELS[b]}</span>
                <span className="micro-label text-neutral-500">{open.filter((t) => t.gtd === b).length}</span>
              </div>
              <div className="space-y-2">
                {open.filter((t) => t.gtd === b).map((t) => <TaskCard key={t.id} t={t} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {QUADRANTS.map((q) => {
            const items = open.filter((t) => t.important === q.important && t.urgent === q.urgent);
            return (
              <div key={q.key} className={`border-t-2 ${q.tone} pt-3`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-heading text-[14px] font-extrabold">{q.title}</span>
                  <span className="micro-label text-neutral-500">{q.sub}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {items.length === 0 ? <p className="text-[12px] text-muted">—</p> : items.map((t) => <TaskCard key={t.id} t={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-8">
          <div className="micro-label mb-2">Done · {done.length}</div>
          <div className="space-y-1">
            {done.slice(0, 20).map((t) => <TaskCard key={t.id} t={t} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAdd() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({ description: "", important: false, urgent: false, gtd: "INBOX" as GtdBucket, context: "", dueDate: "" });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const add = () => {
    if (!v.description.trim()) return;
    startTransition(async () => {
      await createTask(v);
      setV({ description: "", important: false, urgent: false, gtd: "INBOX", context: "", dueDate: "" });
      router.refresh();
    });
  };

  return (
    <div className="mb-6 border-2 border-divider p-3">
      <div className="flex flex-wrap items-end gap-2">
        <input className="input min-w-[240px] flex-1" placeholder="Add a task…" value={v.description}
          onChange={(e) => set("description", e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={v.important} onChange={(e) => set("important", e.target.checked)} /> Important</label>
        <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={v.urgent} onChange={(e) => set("urgent", e.target.checked)} /> Urgent</label>
        <select className="input py-1.5 text-[13px]" value={v.gtd} onChange={(e) => set("gtd", e.target.value as GtdBucket)}>
          {GTD_ORDER.map((b) => <option key={b} value={b}>{GTD_LABELS[b]}</option>)}
        </select>
        <input className="input w-[130px] py-1.5 text-[13px]" placeholder="@context" value={v.context} onChange={(e) => set("context", e.target.value)} />
        <input className="input w-[150px] py-1.5 text-[13px]" type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        <button className="btn btn-primary" onClick={add} disabled={pending || !v.description.trim()}><Plus className="h-4 w-4" /> Add</button>
      </div>
    </div>
  );
}

function TaskCard({ t }: { t: TaskRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh(); });

  const overdue = t.dueDate && !t.done && new Date(t.dueDate) < new Date();

  return (
    <div className={`border border-divider bg-bg p-2.5 ${t.done ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <button className="mt-0.5 shrink-0" onClick={() => act(() => setTaskDone(t.id, !t.done))} disabled={pending} aria-label="Toggle done">
          <span className={`flex h-4 w-4 items-center justify-center border ${t.done ? "border-accent bg-accent text-bg" : "border-neutral-500"}`}>
            {t.done && <Check className="h-3 w-3" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] ${t.done ? "line-through text-muted" : ""}`}>{t.description}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {t.context && <span className="tag tag-outline text-[10px]">{t.context}</span>}
            {t.dueDate && <span className={`text-[11px] ${overdue ? "text-accent-700" : "text-muted"}`}>{formatDate(t.dueDate)}</span>}
          </div>
          {!t.done && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button className={`tag text-[10px] ${t.important ? "tag-accent" : "tag-neutral"}`} onClick={() => act(() => updateTask(t.id, { important: !t.important }))} disabled={pending}>Imp</button>
              <button className={`tag text-[10px] ${t.urgent ? "tag-accent" : "tag-neutral"}`} onClick={() => act(() => updateTask(t.id, { urgent: !t.urgent }))} disabled={pending}>Urg</button>
              <select className="input py-0.5 text-[11px]" value={t.gtd} onChange={(e) => act(() => updateTask(t.id, { gtd: e.target.value as GtdBucket }))} disabled={pending}>
                {GTD_ORDER.map((b) => <option key={b} value={b}>{GTD_LABELS[b]}</option>)}
              </select>
            </div>
          )}
        </div>
        <button className="shrink-0 text-neutral-500 hover:text-accent-700" onClick={() => act(() => deleteTask(t.id))} disabled={pending} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
