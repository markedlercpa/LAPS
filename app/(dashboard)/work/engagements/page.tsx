import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SegToggle } from "@/components/ui/seg";
import { EngagementsTable, type EngagementRow } from "@/components/staple/engagements-table";
import { NewEngagementButton } from "@/components/staple/new-engagement";
import { stageCounts } from "@/lib/staple/engagements";
import { STAGE_LABELS, serviceLineLabel } from "@/lib/staple-taxonomy";
import type { StapleStage } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTER_STAGES: (StapleStage | "ALL")[] = [
  "ALL",
  "STAGING",
  "TAKEOFF",
  "ASSEMBLE",
  "PACKAGE",
  "DELIVERED",
];

export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const stageFilter = stage && stage !== "ALL" && stage in STAGE_LABELS ? (stage as StapleStage) : null;

  const [engagements, counts, users] = await Promise.all([
    prisma.engagement.findMany({
      where: stageFilter ? { stage: stageFilter } : {},
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { legalName: true } } },
      take: 200,
    }),
    stageCounts(),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "—"]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const rows: EngagementRow[] = engagements.map((e) => ({
    id: e.id,
    client: e.client.legalName,
    serviceLine: serviceLineLabel(e.serviceLine),
    stage: e.stage,
    stageLabel: STAGE_LABELS[e.stage],
    owner: e.ownerId ? (userName.get(e.ownerId) ?? "—") : "—",
    accepted: e.accepted,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Work — Delivery"
        title="Engagements"
        description="Every delivery engagement, from Staging through close. Won deals land here automatically."
      >
        <NewEngagementButton />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTER_STAGES.filter((s) => s !== "ALL").map((s) => (
          <span key={s} className="tag tag-neutral">
            {STAGE_LABELS[s as StapleStage]}: {counts[s as string] ?? 0}
          </span>
        ))}
        <span className="tag tag-outline">Total: {total}</span>
      </div>

      <div className="mb-4">
        <SegToggle
          param="stage"
          defaultValue="ALL"
          options={FILTER_STAGES.map((s) => ({
            value: s,
            label: s === "ALL" ? "All" : STAGE_LABELS[s as StapleStage],
          }))}
        />
      </div>

      <EngagementsTable rows={rows} />
    </div>
  );
}
