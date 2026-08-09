"use client";

import type { DeliveryStatus } from "@prisma/client";
import { DataTable, distinctOptions, type Column, type FilterDef } from "@/components/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

export type SalesRow = {
  id: string;
  contractId: string | null;
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
    {
      key: "contractId",
      header: "Contract",
      sortable: true,
      className: "whitespace-nowrap",
      render: (r) => <span className="font-mono text-[12px] text-muted">{r.contractId ?? "—"}</span>,
    },
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

  const filters: FilterDef<SalesRow>[] = [
    {
      key: "deliveryStatus",
      label: "Delivery",
      getValue: (r) => r.deliveryStatus,
      options: (Object.keys(STATUS_LABEL) as DeliveryStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    },
    { key: "owner", label: "Owner", getValue: (r) => r.ownerName, options: distinctOptions(rows, (r) => r.ownerName) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["client", "contractId"]}
      filters={filters}
      rowHref={(r) => `/sales/${r.id}`}
      emptyMessage="No closed-won deals yet."
      searchPlaceholder="Search clients"
    />
  );
}
