"use client";

import { useState, useTransition } from "react";
import { startQboConnect } from "@/app/(dashboard)/pace/actions";

/** Kicks off the QBO OAuth connect for one entity (redirects to Intuit). */
export function EntityConnect({
  entityId,
  qboConfigured,
  connected,
}: {
  entityId: string;
  qboConfigured: boolean;
  connected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!qboConfigured) return <span className="text-[12px] text-muted">Manual</span>;

  function connect() {
    setError(null);
    startTransition(async () => {
      const res = await startQboConnect(entityId);
      if (res.ok) window.location.href = res.url;
      else setError(res.error);
    });
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-[12px] text-accent-700">{error}</span>}
      <button className="btn btn-ghost text-[12px]" onClick={connect} disabled={pending}>
        {pending ? "…" : connected ? "Reconnect QBO" : "Connect QBO"}
      </button>
    </span>
  );
}
