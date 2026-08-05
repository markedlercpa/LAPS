"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signProposal, declineProposal } from "./actions";
import { formatCurrency } from "@/lib/utils";

export function SignProposal({
  token,
  defaultName,
  defaultEmail,
  depositAmount = 0,
  paymentRequired = false,
}: {
  token: string;
  defaultName?: string;
  defaultEmail?: string;
  depositAmount?: number;
  paymentRequired?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const submit = () => {
    setError(null);
    if (!agree) {
      setError("Please confirm you agree to the terms before signing.");
      return;
    }
    startTransition(async () => {
      const res = await signProposal(token, { signerName: name, signerEmail: email });
      if (!res.ok) {
        setError(res.error ?? "Could not sign. Please try again.");
        return;
      }
      if (res.redirectUrl) {
        // Off to Stripe Checkout to pay the deposit; the deal finalizes on return.
        window.location.href = res.redirectUrl;
        return;
      }
      router.refresh();
    });
  };

  const submitDecline = () => {
    setError(null);
    startTransition(async () => {
      const res = await declineProposal(token, { reason: declineReason });
      if (!res.ok) setError(res.error ?? "Could not submit. Please try again.");
      else router.refresh();
    });
  };

  return (
    <div className="border-2 border-ink bg-surface p-6 no-print">
      <div className="micro-label">Accept &amp; sign</div>
      <h3 className="mt-2">Ready to get started?</h3>
      <p className="text-muted mb-4">
        Type your full legal name below and confirm. Your name, the date, and your device
        details are recorded as your electronic signature.
        {paymentRequired
          ? ` You'll then be taken to secure Stripe checkout to pay the ${formatCurrency(
              depositAmount,
            )} deposit — the proposal is finalized once payment completes.`
          : ""}
      </p>

      <div className="field space-y-3" style={{ maxWidth: 460 }}>
        <div>
          <label htmlFor="signerName">Full legal name</label>
          <input
            id="signerName"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane A. Smith"
          />
        </div>
        <div>
          <label htmlFor="signerEmail">Email (optional)</label>
          <input
            id="signerEmail"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
          />
        </div>
        <label className="flex items-start gap-2 text-[14px]" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            I have read and agree to this proposal and its terms, and I intend this to be my
            electronic signature.
          </span>
        </label>
      </div>

      {error && <p className="mt-3 text-[14px] text-accent">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={submit} disabled={pending}>
          {pending
            ? "Submitting…"
            : paymentRequired
              ? `Accept, Sign & Pay ${formatCurrency(depositAmount)}`
              : "Accept & Sign"}
        </button>
        {!declining ? (
          <button
            className="btn btn-secondary"
            onClick={() => setDeclining(true)}
            disabled={pending}
          >
            Decline
          </button>
        ) : null}
      </div>

      {declining && (
        <div className="mt-4 border-t-2 border-divider pt-4" style={{ maxWidth: 460 }}>
          <div className="field">
            <label htmlFor="declineReason">Reason (optional)</label>
            <textarea
              id="declineReason"
              className="input"
              rows={2}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-secondary" onClick={submitDecline} disabled={pending}>
              {pending ? "Submitting…" : "Confirm decline"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setDeclining(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
