"use client";

import type { DeliveryStatus } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

export type SalesRow = {
  id: string;
  client: string;
  value: number;
  wonAt: string | null;
  deliveryStatus: DeliveryStatus;
  progress: string;
  ownerName: string;
  leadId: string;
};

const STATUS_TAG: Record<DeliveryStatus, string> = {
  PENDING: "tag-outline",
  IN_PROGRESS: "tag-accent",
  COMPLETE: "tag-neutral",
};
const STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: "Handoff Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
};

export function SalesTable({ rows }: { rows: SalesRow[] }) {
  const columns: Column<SalesRow>[] = [
    { key: "client", header: "Client", sortable: true, render: (r) => <span className="font-heading font-extrabold">{r.client}</span> },
    {
      key: "value",
      header: "Contract value",
      sortable: true,
      numeric: true,
      render: (r) => <span className="font-semibold">{formatCurrency(r.value)}</span>,
    },
    {
      key: "wonAt",
      header: "Won",
      sortable: true,
      numeric: true,
      render: (r) => <span className="text-muted">{formatDate(r.wonAt)}</span>,
    },
    { key: "ownerName", header: "Owner", render: (r) => <span className="text-muted">{r.ownerName}</span> },
    {
      key: "deliveryStatus",
      header: "Delivery",
      render: (r) => <span className={`tag ${STATUS_TAG[r.deliveryStatus]}`}>{STATUS_LABEL[r.deliveryStatus]}</span>,
    },
    { key: "progress", header: "Onboarding", numeric: true, render: (r) => <span className="text-muted">{r.progress}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["client"]}
      emptyMessage="No closed-won deals yet."
      searchPlaceholder="Search clients"
    />
  );
}
