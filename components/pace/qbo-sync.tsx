"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { triggerQboSync } from "@/app/(dashboard)/pace/actions";

/** Pull the selected month's trial balance from QBO for this entity. */
export function QboSyncButton({ entityId, month }: { entityId: string; month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    if (!month) {
      setMsg("Pick a month first.");
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await triggerQboSync(entityId, month);
      setMsg(res.ok ? "Synced from QBO." : res.error);
      if (res.ok) router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
      <button className="btn btn-secondary" onClick={sync} disabled={pending}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Refresh from QBO
      </button>
    </span>
  );
}
