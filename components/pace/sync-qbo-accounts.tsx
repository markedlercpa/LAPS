"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncQboAccountsAction } from "@/app/(dashboard)/finance/actions";

/** Pull the QBO chart of accounts (with numbers) into the mapping queue. */
export function SyncQboAccountsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncQboAccountsAction();
      if (res.ok) {
        setMsg(`Synced ${res.synced} account${res.synced === 1 ? "" : "s"} from QuickBooks.`);
        router.refresh();
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn btn-secondary" onClick={sync} disabled={pending}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Syncing…" : "Sync accounts from QBO"}
      </button>
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </span>
  );
}
