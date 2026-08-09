"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import type { InfoStatus } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { addInfo, markInfoReceived } from "@/app/(dashboard)/work/actions";

export type InfoRow = {
  id: string;
  label: string;
  status: InfoStatus;
  statusLabel: string;
  source: string;
  ownerSide: string;
};

const STATUS_TAG: Record<InfoStatus, string> = {
  RECEIVED: "tag-accent",
  REQUESTED: "tag-outline",
  PROMISED: "tag-outline",
  NOT_APPLICABLE: "tag-neutral",
};

/**
 * The Information Registry — the "never ask twice" ledger. Phase 1 supports
 * adding items and marking them received; the RFI generator that validates a
 * client request against this list arrives in Phase 2 (Takeoff).
 */
export function InfoRegistry({
  engagementId,
  clientId,
  rows,
}: {
  engagementId: string;
  clientId: string;
  rows: InfoRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [ownerSide, setOwnerSide] = useState<"US" | "CLIENT" | "THIRD_PARTY">("CLIENT");

  function add() {
    if (!label.trim() || pending) return;
    startTransition(async () => {
      await addInfo({ engagementId, clientId, label, ownerSide, status: "REQUESTED" });
      setLabel("");
      router.refresh();
    });
  }

  function receive(id: string) {
    startTransition(async () => {
      await markInfoReceived(id, engagementId);
      router.refresh();
    });
  }

  const received = rows.filter((r) => r.status === "RECEIVED").length;

  return (
    <div>
      <MicroLabel>Information registry ({received}/{rows.length} received)</MicroLabel>

      <div className="mb-3 mt-2 flex items-end gap-2">
        <label className="field flex-1">
          <span className="micro-label">Add item</span>
          <input
            className="input"
            placeholder="e.g. Trailing-twelve GL detail"
            value={label}
            disabled={pending}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </label>
        <label className="field">
          <span className="micro-label">Owner</span>
          <select className="input" value={ownerSide} onChange={(e) => setOwnerSide(e.target.value as typeof ownerSide)}>
            <option value="CLIENT">Client</option>
            <option value="US">Us</option>
            <option value="THIRD_PARTY">Third party</option>
          </select>
        </label>
        <button className="btn btn-secondary" onClick={add} disabled={pending || !label.trim()}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No items yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Owner</th>
              <th>Source</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td className="text-muted">{r.ownerSide}</td>
                <td className="text-muted">{r.source}</td>
                <td>
                  <span className={`tag ${STATUS_TAG[r.status]}`}>{r.statusLabel}</span>
                </td>
                <td className="text-right">
                  {r.status !== "RECEIVED" && (
                    <button className="btn btn-ghost text-[12px]" onClick={() => receive(r.id)} disabled={pending}>
                      <Check className="h-3.5 w-3.5" /> Received
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
