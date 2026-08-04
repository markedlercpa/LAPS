"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProposalStatus } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { formatCurrency, cn } from "@/lib/utils";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import {
  addLineItem,
  deleteLineItem,
  updateProposalMeta,
  setProposalStatus,
} from "@/app/(dashboard)/proposals/actions";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

const STATUSES: ProposalStatus[] = ["DRAFT", "SENT", "VIEWED", "SIGNED", "WON", "LOST"];

export function ProposalEditor({
  proposal,
}: {
  proposal: {
    id: string;
    status: ProposalStatus;
    estimatedDeliveryCost: number;
    lineItems: LineItem[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [deliveryCost, setDeliveryCost] = useState(String(proposal.estimatedDeliveryCost));

  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const contractValue = proposal.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const deliveryNum = parseFloat(deliveryCost) || 0;
  const margin = contractValue - deliveryNum;
  const marginPct = contractValue > 0 ? (margin / contractValue) * 100 : 0;

  const saveDelivery = () =>
    startTransition(async () => {
      await updateProposalMeta(proposal.id, { estimatedDeliveryCost: deliveryNum });
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

  const changeStatus = (status: ProposalStatus) => {
    setMsg(null);
    startTransition(async () => {
      const res = await setProposalStatus(proposal.id, status);
      if (!res.ok) setMsg(res.error ?? "Failed");
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-[1fr_350px] border-t-2 border-divider max-lg:grid-cols-1">
      {/* Left — scope & pricing */}
      <div className="border-r border-divider py-6 pr-8 max-lg:border-r-0 max-lg:pr-0">
        <MicroLabel>Scope &amp; pricing</MicroLabel>
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
      </div>

      {/* Right — internal margin + status */}
      <div className="py-6 pl-8 max-lg:pl-0">
        <MicroLabel>Internal margin</MicroLabel>
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
          Internal only — used to compute margin. Required to mark Won.
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

        <div className="mt-8">
          <MicroLabel>Status</MicroLabel>
          <select
            className="input mt-3"
            value={proposal.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value as ProposalStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROPOSAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-muted">
            Marking <strong className="text-ink">Won</strong> moves the client to Sales Closed and
            starts the onboarding checklist. <strong className="text-ink">Lost</strong> closes the lead.
          </p>
          {msg && <p className="mt-2 text-[14px] text-accent-700">{msg}</p>}
        </div>

        <hr className="hr" />
        <p className="text-[12px] text-muted">
          E-signature, payment schedules (Stripe), and QBO invoicing arrive in later phases.
          Status is tracked manually for now.
        </p>
      </div>
    </div>
  );
}
