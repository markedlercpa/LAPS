import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { TodoBoard, type TaskRow } from "@/components/triage/todo-board";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "gtd" ? "gtd" : "matrix";

  const session = await auth();
  const userId = session?.user?.id;

  // Show my tasks + unassigned standalone to-dos (not tied to a lead/appt list).
  const items = await prisma.actionItem.findMany({
    where: {
      OR: [
        { assigneeId: userId ?? "__none__" },
        { assigneeId: null, appointmentId: null, leadId: null },
      ],
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const rows: TaskRow[] = items.map((t) => ({
    id: t.id,
    description: t.description,
    important: t.important,
    urgent: t.urgent,
    gtd: t.gtd,
    context: t.context,
    dueDate: t.dueDate?.toISOString() ?? null,
    done: t.status === "DONE",
  }));

  const open = rows.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length;
  const doFirst = open.filter((t) => t.important && t.urgent).length;

  return (
    <div>
      <PageHeader
        eyebrow="Triage — To-Do"
        title="To-Do"
        description="Your task list, organized by the Eisenhower matrix (important × urgent) and GTD buckets. Capture in the Inbox, clarify, then work the top-left quadrant first."
      />

      <MetricRow
        metrics={[
          { label: "Open tasks", value: open.length },
          { label: "Do first", value: doFirst, accent: doFirst > 0 },
          { label: "Overdue", value: overdue },
          { label: "Completed", value: rows.length - open.length },
        ]}
      />

      <div className="mt-8">
        <TodoBoard tasks={rows} view={view} />
      </div>
    </div>
  );
}
