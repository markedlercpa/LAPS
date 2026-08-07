"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StatementKind } from "@prisma/client";
import { mapAccountAction } from "@/app/(dashboard)/pace/actions";

export type ReportingOption = { id: string; label: string; statement: StatementKind };
export type LedgerAccountRow = {
  id: string;
  name: string;
  entity: string;
  mappedReportingAccountId: string | null;
};

export function MappingTable({ rows, options }: { rows: LedgerAccountRow[]; options: ReportingOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(ledgerAccountId: string, value: string) {
    startTransition(async () => {
      await mapAccountAction(ledgerAccountId, value || null);
      router.refresh();
    });
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Source account</th>
          <th>Entity</th>
          <th>Reporting account</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.mappedReportingAccountId ? "" : "bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)]"}>
            <td>{r.name}</td>
            <td className="text-muted">{r.entity}</td>
            <td>
              <select
                className="input"
                defaultValue={r.mappedReportingAccountId ?? ""}
                disabled={pending}
                onChange={(e) => onChange(r.id, e.target.value)}
              >
                <option value="">— unmapped —</option>
                <optgroup label="Income Statement">
                  {options.filter((o) => o.statement === "IS").map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Balance Sheet">
                  {options.filter((o) => o.statement === "BS").map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </optgroup>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
