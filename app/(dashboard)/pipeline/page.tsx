import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { MicroLabel } from "@/components/micro-label";
import { Funnel } from "@/components/reporting/funnel";
import { RepTable } from "@/components/reporting/rep-table";
import { getPipelineOverview, getRepReport } from "@/lib/reporting";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [overview, reps] = await Promise.all([getPipelineOverview(), getRepReport()]);

  return (
    <div>
      <PageHeader
        eyebrow="00 — Overview"
        title="Pipeline"
        description="The LAPS funnel end to end, with conversion between each stage."
      />

      <MetricRow
        metrics={[
          {
            label: "Open pipeline",
            value: formatCurrency(overview.openValue),
            note: `${overview.openCount} live proposals`,
          },
          {
            label: "Closed won · 90d",
            value: formatCurrency(overview.wonValue90d),
            note: `${overview.wonCount90d} deals`,
            accent: true,
          },
          {
            label: "Win rate",
            value: `${Math.round(overview.winRate * 100)}%`,
            note: `${overview.wonCount90d} won, ${overview.lostCount90d} lost`,
          },
          {
            label: "Avg cycle",
            value: overview.avgCycleDays != null ? `${overview.avgCycleDays}d` : "—",
            note: "lead to won",
          },
        ]}
      />

      <Funnel rows={overview.funnel} />

      <div className="mt-14">
        <MicroLabel>By rep</MicroLabel>
        <div className="mt-4">
          <RepTable reps={reps} />
        </div>
      </div>
    </div>
  );
}
