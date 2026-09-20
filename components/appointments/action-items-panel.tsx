"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { addActionItem, toggleActionItem } from "@/app/(dashboard)/appointments/actions";

export type ActionItemRow = {
  id: string;
  description: string;
  dueDate: string | null;
  done: boolean;
  apptTitle: string;
  leadName: string;
};

export type ApptOption = { id: string; title: string; leadId: string };

export function ActionItemsPanel({
  items,
  apptOptions,
}: {
  items: ActionItemRow[];
  apptOptions: ApptOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [apptId, setApptId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const toggle = (id: string, done: boolean) =>
    startTransition(async () => {
      await toggleActionItem(id, done);
      router.refresh();
    });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptId || !description) return;
    const opt = apptOptions.find((o) => o.id === apptId);
    startTransition(async () => {
      await addActionItem({ appointmentId: apptId, leadId: opt?.leadId, description, dueDate });
      setDescription("");
      setDueDate("");
      router.refresh();
    });
  };

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const ordered = [...open, ...done];

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between border-b-2 border-divider pb-2">
        <div className="micro-label">Action items</div>
        <div className="text-[12px] font-semibold text-accent-700">{open.length} open</div>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-b border-divider py-3">
        <select className="input w-[280px] max-w-full" value={apptId} onChange={(e) => setApptId(e.target.value)}>
          <option value="">Appointment…</option>
          {apptOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        <input
          className="input flex-1"
          placeholder="Action item…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input type="date" className="input w-[160px]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={pending || !apptId || !description}>
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>

      {ordered.length === 0 && <p className="py-4 text-[14px] text-muted">No open action items.</p>}
      {ordered.map((i) => (
        <label
          key={i.id}
          className="grid grid-cols-[18px_1fr_auto] items-center gap-3 border-b border-divider py-3"
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={i.done}
            onChange={(e) => toggle(i.id, e.target.checked)}
          />
          <span className={i.done ? "text-[15px] text-neutral-700 line-through" : "text-[15px]"}>
            {i.description}
          </span>
          <span className="text-right text-[12px] text-muted">
            {i.leadName}
            {i.dueDate ? ` · due ${formatDate(i.dueDate)}` : ""}
          </span>
        </label>
      ))}
    </section>
  );
}
