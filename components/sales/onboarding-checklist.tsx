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
    <div>
      {items.map((item) => (
        <label
          key={item.id}
          className="grid grid-cols-[18px_1fr] items-center gap-3 border-b border-divider py-2.5 last:border-b-0"
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={item.done}
            disabled={pending}
            onChange={(e) => toggle(item.id, e.target.checked)}
          />
          <span className={item.done ? "text-[14px] text-neutral-700 line-through" : "text-[14px]"}>
            {item.label}
          </span>
        </label>
      ))}
    </div>
  );
}
