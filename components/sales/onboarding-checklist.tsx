"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleChecklistItem } from "@/app/(dashboard)/sales/actions";

export type ChecklistRow = {
  id: string;
  label: string;
  done: boolean;
};

export function OnboardingChecklist({ items }: { items: ChecklistRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (id: string, done: boolean) =>
    startTransition(async () => {
      await toggleChecklistItem(id, done);
      router.refresh();
    });

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <label className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-accent/50">
            <input
              type="checkbox"
              checked={item.done}
              disabled={pending}
              onChange={(e) => toggle(item.id, e.target.checked)}
              className="h-4 w-4"
            />
            <span
              className={
                item.done ? "text-sm text-muted-foreground line-through" : "text-sm"
              }
            >
              {item.label}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
