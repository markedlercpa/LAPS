"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmBookingAction, declineBookingAction } from "@/app/(dashboard)/work/capacity/actions";

export function QueueActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Failed");
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {err && <span className="text-[12px] text-accent-700">{err}</span>}
      <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => confirmBookingAction(id))}>Confirm</button>
      <button className="btn btn-ghost" disabled={pending} onClick={() => run(() => declineBookingAction(id))}>Decline</button>
    </div>
  );
}
