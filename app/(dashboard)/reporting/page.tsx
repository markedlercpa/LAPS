import { PageHeader } from "@/components/page-header";
import { ReportingView } from "@/components/reporting/reporting-view";
import {
  getLapsPerformance,
  getOpenPipeline,
  getRepReport,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

export default async function ReportingPage() {
  const [week, month, quarter, pipeline, reps] = await Promise.all([
    getLapsPerformance("week", 8),
    getLapsPerformance("month", 6),
    getLapsPerformance("quarter", 4),
    getOpenPipeline(),
    getRepReport(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="05 — Reporting"
        title="Reporting"
        description="Sales performance, open pipeline, and per-rep results."
      />
      <ReportingView laps={{ week, month, quarter }} pipeline={pipeline} reps={reps} />
    </div>
  );
}
