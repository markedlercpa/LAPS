import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { CashSettings } from "@/components/pace/cash-settings";
import { CashLines, type CashLineRow } from "@/components/pace/cash-lines";
import { buildForecast, getCashPosition, listCashLines, latestCashActualCents, type Mode } from "@/lib/pace/cash";

export const dynamic = "force-dynamic";

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const mode: Mode = sp.mode === "monthly" ? "monthly" : "weekly";

  const [forecast, position, lines, actual] = await Promise.all([
    buildForecast(mode),
    getCashPosition(),
    listCashLines(),
    latestCashActualCents(),
  ]);

  const lineRows: CashLineRow[] = lines.map((l) => ({
    id: l.id,
    label: l.label,
    kind: l.kind,
    amount: l.amountCents / 100,
    cadence: l.cadence,
    startDate: l.startDate.toISOString().slice(0, 10),
    endDate: l.endDate ? l.endDate.toISOString().slice(0, 10) : null,
    category: l.category,
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        eyebrow="Finance — Cash"
        title="Cash forecast"
        description="Firm-level cash roll from data internal to Pulse: signed/won proposal payments (in), committed capacity labor + director base (out), plus your manual lines. Beginning rolls to ending each period; endings under the buffer are flagged."
      >
        <Link href="/finance/cash?mode=weekly" className={`btn ${mode === "weekly" ? "btn-primary" : "btn-secondary"}`}>13-week</Link>
        <Link href="/finance/cash?mode=monthly" className={`btn ${mode === "monthly" ? "btn-primary" : "btn-secondary"}`}>12-month</Link>
      </PageHeader>

      <MetricRow
        metrics={[
          { label: mode === "weekly" ? "Cash in 13 weeks" : "Cash in 12 months", value: usd(forecast.totals.endingCents) },
          { label: "Lowest ending", value: usd(forecast.lowestEndingCents), accent: forecast.lowestEndingCents < forecast.minCashCents },
          { label: "Min-cash buffer", value: usd(forecast.minCashCents) },
          {
            label: "First shortfall",
            value: forecast.firstBreachKey ?? "None",
            accent: !!forecast.firstBreachKey,
            note: forecast.firstBreachKey ? "ending below buffer" : "stays above buffer",
          },
        ]}
      />

      <div className="mt-6 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Period</th>
              <th className="num">Beginning</th>
              <th className="num">Proposals +</th>
              <th className="num">Other in +</th>
              <th className="num">Labor −</th>
              <th className="num">Director −</th>
              <th className="num">Other out −</th>
              <th className="num">Ending</th>
            </tr>
          </thead>
          <tbody>
            {forecast.rows.map((r) => (
              <tr key={r.key} className={r.breach ? "bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]" : ""}>
                <td className="font-heading font-extrabold">{r.label}</td>
                <td className="num text-muted">{usd(r.beginningCents)}</td>
                <td className="num">{r.sources.proposalsCents ? usd(r.sources.proposalsCents) : "—"}</td>
                <td className="num">{r.sources.manualInCents ? usd(r.sources.manualInCents) : "—"}</td>
                <td className="num">{r.sources.laborCents ? usd(r.sources.laborCents) : "—"}</td>
                <td className="num">{r.sources.directorCents ? usd(r.sources.directorCents) : "—"}</td>
                <td className="num">{r.sources.manualOutCents ? usd(r.sources.manualOutCents) : "—"}</td>
                <td className={`num font-heading font-extrabold ${r.breach ? "text-accent-700" : ""}`}>{usd(r.endingCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[12px] text-muted">
        Opening cash {usd(forecast.openingCents)}. Inflows total {usd(forecast.totals.inflowCents)}, outflows{" "}
        {usd(forecast.totals.outflowCents)} across the {mode === "weekly" ? "13 weeks" : "12 months"}.
      </p>

      <div className="mt-8">
        <div className="micro-label mb-2">Opening cash & buffer</div>
        <CashSettings
          opening={(position?.openingCents ?? 0) / 100}
          openingAsOf={position?.openingAsOf ? position.openingAsOf.toISOString().slice(0, 10) : today}
          minCash={(position?.minCashCents ?? 0) / 100}
          actualSuggestion={actual != null ? Math.round(actual / 100) : null}
        />
      </div>

      <div className="mt-8">
        <div className="micro-label mb-2">Manual cash lines</div>
        <CashLines rows={lineRows} />
      </div>
    </div>
  );
}
