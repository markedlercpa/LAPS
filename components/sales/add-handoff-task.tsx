"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addChecklistItem } from "@/app/(dashboard)/sales/actions";

export function AddHandoffTask({ handoffId }: { handoffId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!label.trim()) return;
    startTransition(async () => {
      await addChecklistItem(handoffId, label);
      setLabel("");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        className="input flex-1 text-[13px]"
        placeholder="Add a handoff task…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <button className="btn btn-secondary text-[13px]" onClick={add} disabled={pending || !label.trim()}>
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </div>
  );
}
