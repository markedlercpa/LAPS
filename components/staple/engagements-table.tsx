"use client";

import type { StapleStage } from "@prisma/client";
import { DataTable, distinctOptions, type Column, type FilterDef } from "@/components/data-table";
import { formatDate } from "@/lib/utils";

export type EngagementRow = {
  id: string;
  client: string;
  serviceLine: string;
  stage: StapleStage;
  stageLabel: string;
  owner: string;
  accepted: boolean;
  createdAt: string;
};

const STAGE_TAG: Record<StapleStage, string> = {
  STAGING: "tag-outline",
  TAKEOFF: "tag-outline",
  ASSEMBLE: "tag-neutral",
  PACKAGE: "tag-neutral",
  DELIVERED: "tag-accent",
  LEVERAGE: "tag-accent",
  EVANGELIZE: "tag-accent",
  CLOSED: "tag-neutral",
};

export function EngagementsTable({ rows }: { rows: EngagementRow[] }) {
  const columns: Column<EngagementRow>[] = [
    {
      key: "client",
      header: "Client",
      sortable: true,
      render: (r) => <span className="font-heading font-extrabold">{r.client}</span>,
    },
    { key: "serviceLine", header: "Service line", sortable: true, render: (r) => <span className="text-muted">{r.serviceLine}</span> },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      sortValue: (r) => r.stageLabel,
      render: (r) => <span className={`tag ${STAGE_TAG[r.stage]}`}>{r.stageLabel}</span>,
    },
    { key: "owner", header: "Owner", render: (r) => <span className="text-muted">{r.owner}</span> },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      className: "whitespace-nowrap [font-variant-numeric:tabular-nums]",
      render: (r) => formatDate(r.createdAt),
    },
  ];

  const filters: FilterDef<EngagementRow>[] = [
    { key: "serviceLine", label: "Service line", getValue: (r) => r.serviceLine, options: distinctOptions(rows, (r) => r.serviceLine) },
    { key: "owner", label: "Owner", getValue: (r) => r.owner, options: distinctOptions(rows, (r) => r.owner) },
    { key: "accepted", label: "Accepted", getValue: (r) => (r.accepted ? "yes" : "no"), options: [{ value: "yes", label: "Accepted" }, { value: "no", label: "Not accepted" }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["client", "serviceLine"]}
      filters={filters}
      rowHref={(r) => `/work/engagements/${r.id}`}
      emptyMessage="No engagements yet. Won deals land here automatically, or create one manually."
      searchPlaceholder="Search engagements"
    />
  );
}
