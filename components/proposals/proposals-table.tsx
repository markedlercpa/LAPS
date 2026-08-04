"use client";

import type { ProposalStatus } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { ProposalStatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ProposalRow = {
  id: string;
  title: string;
  leadName: string;
  ownerName: string;
  status: ProposalStatus;
  contractValue: number;
  margin: number;
  marginPct: number;
  createdAt: string;
};

export function ProposalsTable({
  rows,
  emptyMessage,
}: {
  rows: ProposalRow[];
  emptyMessage?: string;
}) {
  const columns: Column<ProposalRow>[] = [
    {
      key: "title",
      header: "Proposal",
      sortable: true,
      render: (r) => <span className="font-heading font-extrabold">{r.title}</span>,
    },
    { key: "leadName", header: "Client", sortable: true, render: (r) => <span className="text-muted">{r.leadName}</span> },
    {
      key: "contractValue",
      header: "Value",
      sortable: true,
      numeric: true,
      render: (r) => <span className="font-semibold">{formatCurrency(r.contractValue)}</span>,
    },
    {
      key: "margin",
      header: "Est. margin",
      sortable: true,
      numeric: true,
      sortValue: (r) => r.marginPct,
      render: (r) => (
        <span className={r.marginPct < 40 ? "text-accent-700" : "text-ink"}>
          {formatCurrency(r.margin)} ({r.marginPct.toFixed(0)}%)
        </span>
      ),
    },
    { key: "ownerName", header: "Owner", render: (r) => <span className="text-muted">{r.ownerName}</span> },
    { key: "status", header: "Status", render: (r) => <ProposalStatusBadge status={r.status} /> },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      numeric: true,
      render: (r) => <span className="text-muted">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["title", "leadName"]}
      rowHref={(r) => `/proposals/${r.id}`}
      emptyMessage={emptyMessage ?? "No proposals yet."}
      searchPlaceholder="Search proposals"
    />
  );
}
