"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTimeEntryAction } from "@/app/(dashboard)/work/capacity/actions";

export function DeleteTimeEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function del() {
    startTransition(async () => {
      const res = await deleteTimeEntryAction(id);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <button className="btn btn-ghost btn-icon" onClick={del} disabled={pending} aria-label="Delete entry" title="Delete entry">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
