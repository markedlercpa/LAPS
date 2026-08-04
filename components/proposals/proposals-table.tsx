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
    { key: "title", header: "Proposal", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "leadName", header: "Client", sortable: true },
    {
      key: "contractValue",
      header: "Value",
      sortable: true,
      render: (r) => formatCurrency(r.contractValue),
    },
    {
      key: "margin",
      header: "Est. Margin",
      sortable: true,
      sortValue: (r) => r.marginPct,
      render: (r) => (
        <span className={r.marginPct < 40 ? "text-amber-600" : "text-green-700"}>
          {formatCurrency(r.margin)} ({r.marginPct.toFixed(0)}%)
        </span>
      ),
    },
    { key: "ownerName", header: "Owner" },
    { key: "status", header: "Status", render: (r) => <ProposalStatusBadge status={r.status} /> },
    { key: "createdAt", header: "Created", sortable: true, render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["title", "leadName"]}
      rowHref={(r) => `/proposals/${r.id}`}
      emptyMessage={emptyMessage ?? "No proposals yet."}
    />
  );
}
