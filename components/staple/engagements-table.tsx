"use client";

import type { StapleStage } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
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

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKeys={["client", "serviceLine"]}
      rowHref={(r) => `/staple/engagements/${r.id}`}
      emptyMessage="No engagements yet. Won deals land here automatically, or create one manually."
      searchPlaceholder="Search engagements"
    />
  );
}
