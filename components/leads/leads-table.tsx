"use client";

import type { Stage } from "@prisma/client";
import { DataTable, distinctOptions, type Column, type FilterDef } from "@/components/data-table";
import { StageBadge } from "@/components/status-badge";
import { TrustBadge } from "@/components/leads/trust-badge";
import { STAGE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  leadSource: string | null;
  email: string | null;
  phone: string | null;
  stage: Stage;
  ownerName: string;
  trustScore: number;
  revenueEstimate: number | null;
  headcountEstimate: number | null;
  createdAt: string;
};

function compactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function LeadsTable({
  rows,
  toolbarLeft,
}: {
  rows: LeadRow[];
  toolbarLeft?: React.ReactNode;
}) {
  const columns: Column<LeadRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      className: "whitespace-nowrap",
      sortValue: (r) => `${r.lastName} ${r.firstName}`.toLowerCase(),
      render: (r) => (
        <span className="font-heading font-extrabold">
          {r.firstName} {r.lastName}
        </span>
      ),
    },
    { key: "companyName", header: "Company", sortable: true, render: (r) => r.companyName || "—" },
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
      sortable: true,
      numeric: true,
      sortValue: (r) => r.headcountEstimate ?? -1,
      render: (r) => <span className="text-muted">{r.headcountEstimate ?? "—"}</span>,
    },
    { key: "leadSource", header: "Source", render: (r) => <span className="text-muted">{r.leadSource || "—"}</span> },
    { key: "ownerName", header: "Owner", sortable: true, render: (r) => <span className="text-muted">{r.ownerName}</span> },
    { key: "stage", header: "Stage", render: (r) => <StageBadge stage={r.stage} /> },
    {
      key: "trustScore",
      header: "Trust",
      sortable: true,
      numeric: true,
      sortValue: (r) => r.trustScore,
      render: (r) => <TrustBadge score={r.trustScore} />,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      numeric: true,
      render: (r) => <span className="text-muted">{formatDate(r.createdAt)}</span>,
    },
  ];

  const filters: FilterDef<LeadRow>[] = [
    {
      key: "stage",
      label: "Stage",
      getValue: (r) => r.stage,
      options: Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label: label as string })),
    },
    { key: "owner", label: "Owner", getValue: (r) => r.ownerName, options: distinctOptions(rows, (r) => r.ownerName) },
    { key: "source", label: "Source", getValue: (r) => r.leadSource ?? "", options: distinctOptions(rows, (r) => r.leadSource) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["firstName", "lastName", "companyName", "email", "leadSource"]}
      filters={filters}
      rowHref={(r) => `/leads/${r.id}`}
      emptyMessage="No leads yet. Add your first lead to get started."
      toolbarLeft={toolbarLeft}
      searchPlaceholder="Search leads"
    />
  );
}
