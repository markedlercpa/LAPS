"use client";

import type { DeliveryStatus } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
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

const STATUS_STYLE: Record<DeliveryStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETE: "bg-green-100 text-green-700",
};
const STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: "Handoff Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
};

export function SalesTable({ rows }: { rows: SalesRow[] }) {
  const columns: Column<SalesRow>[] = [
    { key: "client", header: "Client", sortable: true, render: (r) => <span className="font-medium">{r.client}</span> },
    { key: "value", header: "Contract Value", sortable: true, render: (r) => formatCurrency(r.value) },
    { key: "wonAt", header: "Won", sortable: true, render: (r) => formatDate(r.wonAt) },
    { key: "ownerName", header: "Owner" },
    {
      key: "deliveryStatus",
      header: "Delivery",
      render: (r) => (
        <Badge className={STATUS_STYLE[r.deliveryStatus]}>
          {STATUS_LABEL[r.deliveryStatus]}
        </Badge>
      ),
    },
    { key: "progress", header: "Onboarding", render: (r) => r.progress },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["client"]}
      emptyMessage="No closed-won deals yet."
    />
  );
}
