"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAppointment } from "@/app/(dashboard)/appointments/actions";

/** Permanently delete an appointment (with a one-click confirm). Admin cleanup. */
export function DeleteAppointmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const del = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await deleteAppointment(id);
      router.refresh();
    });
  };

  if (confirming) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost text-[12px] text-accent-700" onClick={del} disabled={pending}>
          {pending ? "Deleting…" : "Confirm"}
        </button>
        <button className="btn btn-ghost text-[12px]" onClick={(e) => { e.stopPropagation(); setConfirming(false); }} disabled={pending}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      className="btn-icon text-neutral-500 hover:text-accent"
      title="Delete appointment"
      aria-label="Delete appointment"
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
