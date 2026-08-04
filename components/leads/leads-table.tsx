"use client";

import type { Stage } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { StageBadge } from "@/components/status-badge";
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
  createdAt: string;
};

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
    { key: "leadSource", header: "Source", render: (r) => <span className="text-muted">{r.leadSource || "—"}</span> },
    { key: "email", header: "Email", render: (r) => <span className="text-muted">{r.email || "—"}</span> },
    { key: "ownerName", header: "Owner", sortable: true, render: (r) => <span className="text-muted">{r.ownerName}</span> },
    { key: "stage", header: "Stage", render: (r) => <StageBadge stage={r.stage} /> },
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
      searchKeys={["firstName", "lastName", "companyName", "email", "leadSource"]}
      rowHref={(r) => `/leads/${r.id}`}
      emptyMessage="No leads yet. Add your first lead to get started."
      toolbarLeft={toolbarLeft}
      searchPlaceholder="Search leads"
    />
  );
}
