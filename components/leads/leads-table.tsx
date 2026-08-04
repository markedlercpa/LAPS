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

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const columns: Column<LeadRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (r) => `${r.lastName} ${r.firstName}`.toLowerCase(),
      render: (r) => (
        <span className="font-medium">
          {r.firstName} {r.lastName}
        </span>
      ),
    },
    { key: "companyName", header: "Company", sortable: true, render: (r) => r.companyName || "—" },
    { key: "leadSource", header: "Source", render: (r) => r.leadSource || "—" },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    { key: "ownerName", header: "Owner", sortable: true },
    { key: "stage", header: "Stage", render: (r) => <StageBadge stage={r.stage} /> },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (r) => formatDate(r.createdAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["firstName", "lastName", "companyName", "email"]}
      rowHref={(r) => `/leads/${r.id}`}
      emptyMessage="No leads yet. Add your first lead to get started."
    />
  );
}
