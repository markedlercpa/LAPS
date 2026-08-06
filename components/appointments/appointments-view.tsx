"use client";

import dynamic from "next/dynamic";
import type { AppointmentStatus } from "@prisma/client";
import { DataTable, type Column } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentStatusSelect } from "@/components/appointments/appointment-status-select";
import { DeleteAppointmentButton } from "@/components/appointments/delete-appointment-button";
import { formatDateTime } from "@/lib/utils";

const AppointmentCalendar = dynamic(
  () => import("@/components/appointments/appointment-calendar"),
  { ssr: false, loading: () => <p className="text-[14px] text-muted">Loading calendar…</p> },
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
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (r) => <span className="font-heading font-extrabold">{r.title}</span>,
    },
    { key: "leadName", header: "Lead", sortable: true, render: (r) => <span className="text-muted">{r.leadName}</span> },
    {
      key: "scheduledAt",
      header: "When",
      sortable: true,
      className: "whitespace-nowrap [font-variant-numeric:tabular-nums]",
      render: (r) => formatDateTime(r.scheduledAt),
    },
    { key: "ownerName", header: "Owner", render: (r) => <span className="text-muted">{r.ownerName}</span> },
    {
      key: "status",
      header: "Status",
      numeric: true,
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <AppointmentStatusSelect id={r.id} status={r.status} />
          <DeleteAppointmentButton id={r.id} />
        </div>
      ),
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
          searchPlaceholder="Search appointments"
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
