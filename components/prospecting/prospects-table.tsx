"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProspectStatus } from "@prisma/client";
import { DataTable, distinctOptions, type Column, type FilterDef } from "@/components/data-table";
import { promoteProspect, updateProspectStatus } from "@/app/(dashboard)/prospecting/actions";

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  COLD: "Cold",
  QUEUED: "Queued",
  IN_SEQUENCE: "In sequence",
  ENGAGED: "Engaged",
  PROMOTED: "Promoted",
  DISQUALIFIED: "Disqualified",
};

export type ProspectRow = {
  id: string;
  companyName: string;
  contactName: string | null;
  title: string | null;
  industry: string | null;
  tier: string;
  status: ProspectStatus;
  revenueEstimate: number | null;
  headcountEstimate: number | null;
  source: string | null;
  ownerName: string;
  promotedLeadId: string | null;
};

function compactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function ProspectsTable({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const columns: Column<ProspectRow>[] = [
    { key: "companyName", header: "Company", sortable: true, render: (r) => <span className="font-heading font-extrabold">{r.companyName}</span> },
    { key: "contactName", header: "Contact", render: (r) => <span>{r.contactName ?? "—"}{r.title ? <span className="text-muted"> · {r.title}</span> : null}</span> },
    { key: "tier", header: "Tier", sortable: true, render: (r) => <span className="tag tag-outline">{r.tier}</span> },
    {
      key: "revenueEstimate",
      header: "Est. rev",
      sortable: true,
      numeric: true,
      sortValue: (r) => r.revenueEstimate ?? -1,
      render: (r) => <span className="text-muted">{r.revenueEstimate != null ? compactUsd(r.revenueEstimate) : "—"}</span>,
    },
    {
      key: "headcountEstimate",
      header: "Headcount",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.headcountEstimate ?? -1,
      render: (r) => <span className="text-muted">{r.headcountEstimate ?? "—"}</span>,
    },
    { key: "source", header: "Source", render: (r) => <span className="text-muted">{r.source ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <select
          className="input py-1 text-[12px]"
          value={r.status}
          disabled={pending || r.status === "PROMOTED"}
          onChange={(e) =>
            startTransition(async () => {
              await updateProspectStatus(r.id, e.target.value as ProspectStatus);
              router.refresh();
            })
          }
        >
          {(Object.keys(PROSPECT_STATUS_LABELS) as ProspectStatus[]).map((s) => (
            <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      ),
    },
    {
      key: "action",
      header: "",
      render: (r) =>
        r.promotedLeadId ? (
          <a className="text-accent-700 text-[12px]" href={`/leads/${r.promotedLeadId}`}>View lead →</a>
        ) : (
          <button
            className="btn btn-secondary text-[12px]"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await promoteProspect(r.id);
                if (res.ok && "leadId" in res && res.leadId) router.push(`/leads/${res.leadId}`);
              })
            }
          >
            Promote → Lead
          </button>
        ),
    },
  ];

  const filters: FilterDef<ProspectRow>[] = [
    { key: "status", label: "Status", getValue: (r) => r.status, options: (Object.keys(PROSPECT_STATUS_LABELS) as ProspectStatus[]).map((s) => ({ value: s, label: PROSPECT_STATUS_LABELS[s] })) },
    { key: "tier", label: "Tier", getValue: (r) => r.tier, options: [{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }] },
    { key: "source", label: "Source", getValue: (r) => r.source ?? "", options: distinctOptions(rows, (r) => r.source) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["companyName", "contactName", "industry"]}
      filters={filters}
      emptyMessage="No prospects yet. Import your Dream 100 list to get started."
      searchPlaceholder="Search prospects"
    />
  );
}
