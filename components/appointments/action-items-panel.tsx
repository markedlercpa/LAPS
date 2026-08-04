"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Action Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <Select
            className="w-56"
            value={apptId}
            onChange={(e) => setApptId(e.target.value)}
          >
            <option value="">Appointment…</option>
            {apptOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
          <Input
            className="flex-1"
            placeholder="Action item…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            type="date"
            className="w-40"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending || !apptId || !description}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>

        <div className="space-y-1">
          {open.length === 0 && (
            <p className="text-sm text-muted-foreground">No open action items.</p>
          )}
          {open.map((i) => (
            <ItemRow key={i.id} item={i} onToggle={toggle} />
          ))}
        </div>

        {done.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Completed</p>
            {done.map((i) => (
              <ItemRow key={i.id} item={i} onToggle={toggle} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  onToggle,
}: {
  item: ActionItemRow;
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        className="h-4 w-4"
      />
      <span className={item.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>
        {item.description}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {item.leadName}
        {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}
      </span>
    </label>
  );
}
