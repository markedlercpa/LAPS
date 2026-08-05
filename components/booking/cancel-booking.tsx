"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { submitCancel } from "@/app/book/actions";

export function CancelBooking({ token }: { token: string }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="mt-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center border-2 border-accent">
          <Check className="h-6 w-6 text-accent" />
        </div>
        <p className="font-heading text-[17px] font-extrabold">Booking canceled</p>
        <p className="mt-1 text-muted">The host has been notified.</p>
      </div>
    );
  }

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await submitCancel(token, reason || undefined);
      if (!res.ok) setError(res.error ?? "Could not cancel");
      else setDone(true);
    });
  };

  return (
    <div className="mt-6">
      <div className="field">
        <label>Reason (optional)</label>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
      <button className="btn btn-primary btn-block mt-3 !justify-center" onClick={cancel} disabled={pending}>
        {pending ? "Canceling…" : "Cancel this booking"}
      </button>
    </div>
  );
}
