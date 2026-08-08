"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { AgingList, AgingRow } from "@/lib/pace/aging";
import { setAgingOverrideAction } from "@/app/(dashboard)/finance/cash-actions";
import { formatCurrency } from "@/lib/utils";

/**
 * Editable AR/AP aging worktable. Each open item shows its QBO due date and the
 * period it currently lands in; you set an expected collection/payment date (or
 * exclude it) and the 14-day + 13-week forecasts spread it exactly that way.
 */
export function CashAging({ data }: { data: AgingList }) {
  if (!data.qboConfigured) {
    return <p className="text-[13px] text-muted">QuickBooks isn&apos;t configured, so there&apos;s no AR/AP aging to spread. Connect QBO to pull open invoices and bills here.</p>;
  }
  if (data.connectedEntities === 0) {
    return <p className="text-[13px] text-muted">No QBO-connected entity — connect one under Entities to pull AR/AP aging.</p>;
  }
  if (data.arParsed === 0 && data.apParsed === 0) {
    return <p className="text-[13px] text-muted">QuickBooks is connected but returned no open AR/AP items (or the aging report couldn&apos;t be read). Nothing to spread yet.</p>;
  }

  return (
    <div className="space-y-6">
      <AgingTable title="Accounts Receivable → collections" rows={data.ar} kind="AR" />
      <AgingTable title="Accounts Payable → disbursements" rows={data.ap} kind="AP" />
    </div>
  );
}

function AgingTable({ title, rows, kind }: { title: string; rows: AgingRow[]; kind: "AR" | "AP" }) {
  const total = rows.filter((r) => !r.excluded).reduce((s, r) => s + r.amount, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="micro-label">{title}</span>
        <span className="tag tag-neutral">{rows.filter((r) => !r.excluded).length} items · {formatCurrency(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No open {kind} items.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>{kind === "AR" ? "Customer" : "Vendor"}</th>
                <th>Doc</th>
                <th>QBO due</th>
                <th className="num">Amount</th>
                <th>Expected date</th>
                <th>Include</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <Row key={r.itemKey} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ r }: { r: AgingRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expected, setExpected] = useState(r.expectedDate ?? "");
  const [excluded, setExcluded] = useState(r.excluded);

  const save = (next: { expectedDate?: string | null; excluded?: boolean }) =>
    startTransition(async () => {
      const expectedDate = next.expectedDate !== undefined ? next.expectedDate : expected || null;
      const excl = next.excluded !== undefined ? next.excluded : excluded;
      await setAgingOverrideAction({ itemKey: r.itemKey, kind: r.kind, expectedDate, excluded: excl });
      router.refresh();
    });

  const reset = () => { setExpected(r.dueDate ?? ""); save({ expectedDate: null }); };

  return (
    <tr className={excluded ? "opacity-50" : ""}>
      <td className="font-heading font-extrabold">{r.name}</td>
      <td className="text-muted">{r.docNumber ?? "—"}</td>
      <td className="text-muted">{r.dueDate ?? "—"}</td>
      <td className="num">{formatCurrency(r.amount)}</td>
      <td>
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="input py-1 text-[12px]"
            value={expected}
            disabled={pending || excluded}
            onChange={(e) => setExpected(e.target.value)}
            onBlur={() => save({})}
          />
          {r.overridden && (
            <button className="btn btn-ghost btn-icon" title="Reset to QBO due date" onClick={reset} disabled={pending}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
      <td>
        <input
          type="checkbox"
          checked={!excluded}
          disabled={pending}
          onChange={(e) => { setExcluded(!e.target.checked); save({ excluded: !e.target.checked }); }}
          aria-label="Include in forecast"
        />
      </td>
    </tr>
  );
}
