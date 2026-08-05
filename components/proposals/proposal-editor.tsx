"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, Copy, Check } from "lucide-react";
import type { ProposalStatus, PaymentScheduleType } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  addLineItem,
  deleteLineItem,
  updateProposalMeta,
  updateProposalContent,
  updatePaymentMeta,
  addPayment,
  deletePayment,
  sendProposal,
  setProposalStatus,
} from "@/app/(dashboard)/proposals/actions";

type LineItem = { id: string; description: string; quantity: number; unitPrice: number };
type Payment = { id: string; description: string; amount: number; dueOn: string | null };

const SCHEDULE_TYPES: { value: PaymentScheduleType; label: string }[] = [
  { value: "ONE_TIME", label: "One-time payment" },
  { value: "DEPOSIT_THEN_BALANCE", label: "Deposit, then balance" },
  { value: "INSTALLMENTS", label: "Installments" },
  { value: "RECURRING", label: "Recurring" },
];

export function ProposalEditor({
  proposal,
  shareUrl,
}: {
  proposal: {
    id: string;
    status: ProposalStatus;
    estimatedDeliveryCost: number;
    coverLetter: string | null;
    scopeNarrative: string | null;
    termsText: string | null;
    paymentScheduleType: PaymentScheduleType;
    recurringInterval: string | null;
    sentAt: string | null;
    viewedAt: string | null;
    signedAt: string | null;
    signerName: string | null;
    lineItems: LineItem[];
    payments: Payment[];
    leadHasEmail: boolean;
  };
  shareUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [deliveryCost, setDeliveryCost] = useState(String(proposal.estimatedDeliveryCost));

  // Document content
  const [cover, setCover] = useState(proposal.coverLetter ?? "");
  const [scope, setScope] = useState(proposal.scopeNarrative ?? "");
  const [terms, setTerms] = useState(proposal.termsText ?? "");
  const [contentSaved, setContentSaved] = useState(false);

  // Line items
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  // Payment schedule
  const [pDesc, setPDesc] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pDue, setPDue] = useState("");

  // Share
  const [link, setLink] = useState<string | null>(shareUrl);
  const [copied, setCopied] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);

  const contractValue = proposal.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const deliveryNum = parseFloat(deliveryCost) || 0;
  const margin = contractValue - deliveryNum;
  const marginPct = contractValue > 0 ? (margin / contractValue) * 100 : 0;
  const scheduledTotal = proposal.payments.reduce((s, p) => s + p.amount, 0);
  const locked = proposal.status === "WON" || proposal.status === "LOST";

  const saveDelivery = () =>
    startTransition(async () => {
      await updateProposalMeta(proposal.id, { estimatedDeliveryCost: deliveryNum });
      router.refresh();
    });

  const saveContent = () =>
    startTransition(async () => {
      await updateProposalContent(proposal.id, {
        coverLetter: cover,
        scopeNarrative: scope,
        termsText: terms,
      });
      setContentSaved(true);
      setTimeout(() => setContentSaved(false), 1500);
      router.refresh();
    });

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc) return;
    startTransition(async () => {
      const res = await addLineItem({ proposalId: proposal.id, description: desc, quantity: qty, unitPrice: price });
      if (res.ok) {
        setDesc("");
        setQty("1");
        setPrice("");
        router.refresh();
      } else setMsg(res.error ?? "Failed");
    });
  };

  const removeItem = (id: string) =>
    startTransition(async () => {
      await deleteLineItem(id, proposal.id);
      router.refresh();
    });

  const changeScheduleType = (value: PaymentScheduleType) =>
    startTransition(async () => {
      await updatePaymentMeta(proposal.id, { paymentScheduleType: value });
      router.refresh();
    });

  const saveInterval = (value: string) =>
    startTransition(async () => {
      await updatePaymentMeta(proposal.id, { recurringInterval: value });
      router.refresh();
    });

  const addPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pDesc) return;
    startTransition(async () => {
      const res = await addPayment({ proposalId: proposal.id, description: pDesc, amount: pAmount, dueOn: pDue });
      if (res.ok) {
        setPDesc("");
        setPAmount("");
        setPDue("");
        router.refresh();
      } else setMsg(res.error ?? "Failed");
    });
  };

  const removePay = (id: string) =>
    startTransition(async () => {
      await deletePayment(id, proposal.id);
      router.refresh();
    });

  const send = () => {
    setMsg(null);
    setSendNote(null);
    startTransition(async () => {
      const res = await sendProposal(proposal.id);
      if (!res.ok) {
        setMsg(res.error ?? "Failed to send");
        return;
      }
      setLink(res.link ?? null);
      setSendNote(
        res.emailed
          ? "Emailed to the client."
          : "Link ready — copy it and send to the client.",
      );
      router.refresh();
    });
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the link is visible to copy manually */
    }
  };

  const markLost = () =>
    startTransition(async () => {
      const res = await setProposalStatus(proposal.id, "LOST");
      if (!res.ok) setMsg(res.error ?? "Failed");
      router.refresh();
    });

  const markWon = () =>
    startTransition(async () => {
      const res = await setProposalStatus(proposal.id, "WON");
      if (!res.ok) setMsg(res.error ?? "Failed");
      router.refresh();
    });

  return (
    <div className="grid grid-cols-[1fr_350px] border-t-2 border-divider max-lg:grid-cols-1">
      {/* Left — document + pricing */}
      <div className="border-r border-divider py-6 pr-8 max-lg:border-r-0 max-lg:pr-0">
        {/* Document content */}
        <div className="flex items-center justify-between">
          <MicroLabel>Proposal document</MicroLabel>
          <button className="btn btn-secondary btn-sm" onClick={saveContent} disabled={pending}>
            {contentSaved ? "Saved" : "Save content"}
          </button>
        </div>
        <div className="field mt-3 space-y-3">
          <div>
            <label>Cover letter</label>
            <textarea
              className="input"
              rows={4}
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="Dear …, thank you for the opportunity…"
            />
          </div>
          <div>
            <label>Scope of work</label>
            <textarea
              className="input"
              rows={5}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="What's included, deliverables, approach…"
            />
          </div>
          <div>
            <label>Terms</label>
            <textarea
              className="input"
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Engagement terms, cancellation, etc."
            />
          </div>
        </div>

        {/* Scope & pricing */}
        <MicroLabel className="mt-8 block">Investment &amp; pricing</MicroLabel>
        <table className="table mt-3">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Total</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {proposal.lineItems.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">No line items yet.</td>
              </tr>
            )}
            {proposal.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.description}</td>
                <td className="num">{li.quantity}</td>
                <td className="num">{formatCurrency(li.unitPrice)}</td>
                <td className="num font-semibold">{formatCurrency(li.quantity * li.unitPrice)}</td>
                <td className="text-right">
                  <button
                    onClick={() => removeItem(li.id)}
                    className="btn btn-ghost btn-icon h-7 w-7"
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="micro-label border-t-2 border-divider pt-3">
                Contract value
              </td>
              <td className="num border-t-2 border-divider pt-3 font-heading text-[20px] font-extrabold">
                {formatCurrency(contractValue)}
              </td>
              <td className="border-t-2 border-divider" />
            </tr>
          </tfoot>
        </table>

        <form onSubmit={addItem} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="field flex-1">
            <label>Description</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Service…" />
          </div>
          <div className="field w-20">
            <label>Qty</label>
            <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field w-[130px]">
            <label>Unit price</label>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending || !desc}>
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>

        {/* Payment schedule */}
        <MicroLabel className="mt-8 block">Payment schedule</MicroLabel>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="field w-[220px]">
            <label>Structure</label>
            <select
              className="input"
              value={proposal.paymentScheduleType}
              disabled={pending}
              onChange={(e) => changeScheduleType(e.target.value as PaymentScheduleType)}
            >
              {SCHEDULE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {proposal.paymentScheduleType === "RECURRING" && (
            <div className="field w-[160px]">
              <label>Interval</label>
              <input
                className="input"
                defaultValue={proposal.recurringInterval ?? ""}
                placeholder="Monthly"
                onBlur={(e) => saveInterval(e.target.value)}
              />
            </div>
          )}
        </div>

        {proposal.payments.length > 0 && (
          <table className="table mt-3">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Due</th>
                <th className="num">Amount</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {proposal.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.description}</td>
                  <td>{p.dueOn || "—"}</td>
                  <td className="num">{formatCurrency(p.amount)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => removePay(p.id)}
                      className="btn btn-ghost btn-icon h-7 w-7"
                      aria-label="Remove payment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="micro-label border-t-2 border-divider pt-3">
                  Scheduled total
                </td>
                <td
                  className={cn(
                    "num border-t-2 border-divider pt-3 font-semibold",
                    Math.abs(scheduledTotal - contractValue) > 0.5 && "text-accent-700",
                  )}
                >
                  {formatCurrency(scheduledTotal)}
                </td>
                <td className="border-t-2 border-divider" />
              </tr>
            </tbody>
          </table>
        )}
        {proposal.payments.length > 0 &&
          Math.abs(scheduledTotal - contractValue) > 0.5 && (
            <p className="mt-1 text-[12px] text-accent-700">
              Scheduled total doesn&apos;t match the {formatCurrency(contractValue)} contract value.
            </p>
          )}

        <form onSubmit={addPay} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="field flex-1">
            <label>Payment</label>
            <input className="input" value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Deposit on signing" />
          </div>
          <div className="field w-[150px]">
            <label>Due</label>
            <input className="input" value={pDue} onChange={(e) => setPDue(e.target.value)} placeholder="On signing" />
          </div>
          <div className="field w-[130px]">
            <label>Amount</label>
            <input className="input" type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={pending || !pDesc}>
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </div>

      {/* Right — send, margin, status */}
      <div className="py-6 pl-8 max-lg:pl-0">
        {/* Send / share */}
        <MicroLabel>Send &amp; sign</MicroLabel>
        {!locked ? (
          <>
            <button className="btn btn-primary btn-block mt-3" onClick={send} disabled={pending}>
              <Send className="h-4 w-4" />
              {proposal.sentAt ? "Resend proposal" : "Send proposal"}
            </button>
            {!proposal.leadHasEmail && (
              <p className="mt-2 text-[12px] text-muted">
                This lead has no email — sending generates a link you can copy and share.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-[13px] text-muted">
            {proposal.status === "WON" ? "Signed and won." : "This proposal is closed."}
          </p>
        )}

        {link && (
          <div className="mt-3 border border-divider bg-surface p-3">
            <div className="micro-label">Client link</div>
            <div className="mt-1 break-all text-[12px]">{link}</div>
            <button className="btn btn-secondary btn-sm mt-2" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        {sendNote && <p className="mt-2 text-[12px] text-muted">{sendNote}</p>}

        {/* Timeline */}
        <div className="mt-4 space-y-1 text-[13px]">
          <TimelineRow label="Sent" date={proposal.sentAt} />
          <TimelineRow label="Viewed by client" date={proposal.viewedAt} />
          <TimelineRow
            label={proposal.signerName ? `Signed by ${proposal.signerName}` : "Signed"}
            date={proposal.signedAt}
          />
        </div>

        {/* Internal margin */}
        <MicroLabel className="mt-8 block">Internal margin</MicroLabel>
        <div className="field mt-3">
          <label>Estimated delivery cost</label>
          <input
            className="input"
            type="number"
            value={deliveryCost}
            onChange={(e) => setDeliveryCost(e.target.value)}
            onBlur={saveDelivery}
          />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Internal only — never shown to the client. Required before sending.
        </p>

        <div className="mt-4 grid grid-cols-2 border-y-2 border-divider">
          <div className="border-r border-divider px-3 pb-4 pt-3">
            <div className="micro-label">Est. margin</div>
            <div className="mt-2 font-heading text-[26px] font-extrabold [font-variant-numeric:tabular-nums]">
              {formatCurrency(margin)}
            </div>
          </div>
          <div className="px-3 pb-4 pt-3">
            <div className="micro-label">Margin %</div>
            <div
              className={cn(
                "mt-2 font-heading text-[26px] font-extrabold [font-variant-numeric:tabular-nums]",
                marginPct < 40 && "text-accent-700",
              )}
            >
              {marginPct.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Manual status controls */}
        {!locked && (
          <div className="mt-8">
            <MicroLabel>Close manually</MicroLabel>
            <p className="mt-2 text-[12px] text-muted">
              The client signing marks this Won automatically. Use these for deals closed
              offline.
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-secondary" onClick={markWon} disabled={pending}>
                Mark Won
              </button>
              <button className="btn btn-ghost" onClick={markLost} disabled={pending}>
                Mark Lost
              </button>
            </div>
          </div>
        )}

        {msg && <p className="mt-3 text-[14px] text-accent-700">{msg}</p>}

        <hr className="hr" />
        <p className="text-[12px] text-muted">
          Payment collection (Stripe) and QBO invoicing arrive in a later phase — the schedule
          above is captured and shown to the client now.
        </p>
      </div>
    </div>
  );
}

function TimelineRow({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-divider py-1">
      <span className={date ? "text-ink" : "text-muted"}>{label}</span>
      <span className="text-muted [font-variant-numeric:tabular-nums]">
        {date ? formatDate(date) : "—"}
      </span>
    </div>
  );
}
