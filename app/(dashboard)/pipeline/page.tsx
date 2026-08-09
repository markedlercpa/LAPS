import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { MicroLabel } from "@/components/micro-label";
import { SegToggle } from "@/components/ui/seg";
import { Funnel } from "@/components/reporting/funnel";
import { RepTable } from "@/components/reporting/rep-table";
import { getPipelineOverview, getRepReport, PIPELINE_WINDOWS } from "@/lib/reporting";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = PIPELINE_WINDOWS.includes(Number(sp.window) as (typeof PIPELINE_WINDOWS)[number])
    ? Number(sp.window)
    : 90;
  const [overview, reps] = await Promise.all([
    getPipelineOverview(windowDays),
    getRepReport(windowDays),
  ]);
  const windowLabel = windowDays >= 365 ? "12 mo" : `${windowDays}d`;

  return (
    <div>
      <PageHeader
        eyebrow="00 — Overview"
        title="Pipeline"
        description="The Sales funnel end to end, with conversion between each stage."
      >
        <SegToggle
          param="window"
          defaultValue="90"
          options={PIPELINE_WINDOWS.map((d) => ({
            value: String(d),
            label: d >= 365 ? "12 mo" : `${d}d`,
          }))}
        />
      </PageHeader>

      <MetricRow
        metrics={[
          {
            label: "Open pipeline",
            value: formatCurrency(overview.openValue),
            note: `${overview.openCount} live proposals`,
          },
          {
            label: `Closed won · ${windowLabel}`,
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
