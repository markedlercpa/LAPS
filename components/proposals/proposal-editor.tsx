"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProposalStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { formatCurrency } from "@/lib/utils";
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

  // new line item draft
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const contractValue = proposal.lineItems.reduce(
    (s, li) => s + li.quantity * li.unitPrice,
    0,
  );
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
      const res = await addLineItem({
        proposalId: proposal.id,
        description: desc,
        quantity: qty,
        unitPrice: price,
      });
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
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Line items */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scope & Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit</th>
                  <th className="pb-2 text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {proposal.lineItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      No line items yet.
                    </td>
                  </tr>
                )}
                {proposal.lineItems.map((li) => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="py-2">{li.description}</td>
                    <td className="py-2 text-right">{li.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(li.unitPrice)}</td>
                    <td className="py-2 text-right font-medium">
                      {formatCurrency(li.quantity * li.unitPrice)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        onClick={() => removeItem(li.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="pt-2" colSpan={3}>
                    Contract value
                  </td>
                  <td className="pt-2 text-right">{formatCurrency(contractValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>

            <form onSubmit={addItem} className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Service…" />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" />
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">Unit price</Label>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" />
              </div>
              <Button type="submit" size="sm" disabled={pending || !desc}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Internal margin + status */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal Margin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Estimated delivery cost (budget)</Label>
              <Input
                type="number"
                value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)}
                onBlur={saveDelivery}
              />
              <p className="text-xs text-muted-foreground">
                Internal only — used to compute margin. Required to mark Won.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Est. Margin" value={formatCurrency(margin)} />
              <StatCard
                label="Margin %"
                value={`${marginPct.toFixed(0)}%`}
                className={marginPct < 40 ? "border-amber-300" : "border-green-300"}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={proposal.status}
              disabled={pending}
              onChange={(e) => changeStatus(e.target.value as ProposalStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROPOSAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Marking <strong>Won</strong> moves the client to Sales Closed and starts the
              onboarding checklist. <strong>Lost</strong> closes the lead.
            </p>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          E-signature, payment schedules (Stripe), and QBO invoicing arrive in later
          phases. Status is tracked manually for now.
        </p>
      </div>
    </div>
  );
}
