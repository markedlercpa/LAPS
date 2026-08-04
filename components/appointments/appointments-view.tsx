"use client";

import dynamic from "next/dynamic";
import type { AppointmentStatus } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentStatusSelect } from "@/components/appointments/appointment-status-select";
import { formatDateTime } from "@/lib/utils";

const AppointmentCalendar = dynamic(
  () => import("@/components/appointments/appointment-calendar"),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Loading calendar…</p> },
);

export type ApptRow = {
  id: string;
  title: string;
  leadName: string;
  leadId: string;
  scheduledAt: string;
  durationMin: number;
  status: AppointmentStatus;
  ownerName: string;
};

export function AppointmentsView({ rows }: { rows: ApptRow[] }) {
  const columns: Column<ApptRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "leadName", header: "Lead", sortable: true },
    {
      key: "scheduledAt",
      header: "When",
      sortable: true,
      render: (r) => formatDateTime(r.scheduledAt),
    },
    { key: "ownerName", header: "Owner" },
    {
      key: "status",
      header: "Status",
      render: (r) => <AppointmentStatusSelect id={r.id} status={r.status} />,
    },
  ];

  return (
    <Tabs defaultValue="table">
      <TabsList>
        <TabsTrigger value="table">Table</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="table">
        <DataTable
          columns={columns}
          data={rows}
          searchKeys={["title", "leadName"]}
          rowHref={(r) => `/leads/${r.leadId}`}
          emptyMessage="No appointments yet."
        />
      </TabsContent>
      <TabsContent value="calendar">
        <AppointmentCalendar
          appts={rows.map((r) => ({
            id: r.id,
            title: r.title,
            scheduledAt: r.scheduledAt,
            durationMin: r.durationMin,
            status: r.status,
          }))}
        />
      </TabsContent>
    </Tabs>
  );
}
