import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { CashStatement } from "@/components/pace/cash-statement";
import { CashIndirect } from "@/components/pace/cash-indirect";
import { buildDirectForecast, buildIndirectForecast } from "@/lib/pace/cash";
import { MODE_LABELS, type CashMode } from "@/lib/pace/cash-taxonomy";

export const dynamic = "force-dynamic";

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const mode: CashMode = sp.mode === "monthly" ? "monthly" : sp.mode === "daily" ? "daily" : "weekly";

  return (
    <div>
      <PageHeader
        eyebrow="Finance — Cash"
        title="Cash forecast"
        description="Firm-level cash roll off data internal to Pulse. Beginning cash pulls from the QB ledgers; proposal payments + committed labor auto-feed, layered with your assumptions."
      >
        {(["daily", "weekly", "monthly"] as CashMode[]).map((m) => (
          <Link key={m} href={`/finance/cash?mode=${m}`} className={`btn ${mode === m ? "btn-primary" : "btn-secondary"}`}>
            {MODE_LABELS[m]}
          </Link>
        ))}
        <Link href="/finance/cash/assumptions" className="btn btn-ghost">Assumptions</Link>
      </PageHeader>

      {mode === "monthly" ? await MonthlyView() : await DirectView(mode)}
    </div>
  );
}

async function DirectView(mode: "daily" | "weekly") {
  const f = await buildDirectForecast(mode);
  const endingLast = f.ending[f.ending.length - 1] ?? f.opening.cents;
  const lowestEnding = Math.min(...(f.ending.length ? f.ending : [f.opening.cents]));

  return (
    <>
      <MetricRow
        metrics={[
          { label: "Beginning cash", value: usd(f.opening.cents), note: f.opening.auto ? `QB ledger${f.opening.asOf ? ` · ${f.opening.asOf}` : ""}` : "manual" },
          { label: mode === "daily" ? "Ending (day 14)" : "Ending (week 13)", value: usd(endingLast) },
          { label: "Lowest ending", value: usd(lowestEnding), accent: lowestEnding < f.minThreshold },
          { label: "Lowest liquidity", value: usd(Math.min(...f.loc.totalLiquidity)) },
        ]}
      />
      <AutoFeedNote f={f} mode={mode} />
      <div className="mt-6">
        <CashStatement f={f} />
      </div>
    </>
  );
}

/** Shows what auto-fed the statement (QBO AR/AP aging, WIP) so the feature is
 * visible and self-diagnosing — and says plainly when nothing flowed. */
function AutoFeedNote({ f, mode }: { f: Awaited<ReturnType<typeof buildDirectForecast>>; mode: "daily" | "weekly" }) {
  const s = f.sources;
  let body: React.ReactNode;
  if (!s.qboConfigured) {
    body = <>QuickBooks isn&apos;t configured, so <strong>AR Collections</strong> and <strong>AP Payments</strong> aren&apos;t auto-fed. Connect QBO, or add lines under <Link className="text-accent-700" href="/finance/cash/assumptions">Assumptions</Link>.</>;
  } else if (s.qboConnectedEntities === 0) {
    body = <>No QBO-connected entity — AR/AP aging can&apos;t be pulled. Connect one under <Link className="text-accent-700" href="/finance/entities">Entities</Link>.</>;
  } else if (s.arParsed === 0 && s.apParsed === 0) {
    body = <>QuickBooks is connected but the aging reports returned <strong>no line items</strong> the parser could read — likely a report-shape difference. This is a mapping issue to fix, not a windowing one; flag it and I&apos;ll adjust.</>;
  } else if (s.arItems === 0 && s.apItems === 0) {
    body = <>QuickBooks returned {s.arParsed} AR + {s.apParsed} AP open items, but none fall inside this {mode === "daily" ? "14-day" : "13-week"} window (all due further out, nothing overdue). Widen the horizon or check the due dates.</>;
  } else {
    body = (
      <>
        <strong>Auto-fed from QuickBooks aging:</strong> {s.arItems} AR invoice{s.arItems === 1 ? "" : "s"} ({usd(s.arCents)}) → AR Collections;{" "}
        {s.apItems} AP bill{s.apItems === 1 ? "" : "s"} ({usd(s.apCents)}) → AP Payments
        {mode === "weekly" && s.wipCents > 0 ? <>; WIP {usd(s.wipCents)} → WIP Collections</> : null}. Spread by due date — override with lines under{" "}
        <Link className="text-accent-700" href="/finance/cash/assumptions">Assumptions</Link>.
      </>
    );
  }
  return <p className="mt-3 rounded-sm border-l-2 border-accent bg-surface px-3 py-2 text-[12px] text-muted">{body}</p>;
}

async function MonthlyView() {
  const f = await buildIndirectForecast();
  const endingLast = f.ending[f.ending.length - 1] ?? f.opening.cents;
  const revenue = f.pnl.find((r) => r.key === "revenue")?.values.reduce((s, x) => s + x, 0) ?? 0;
  const ni = f.pnl.find((r) => r.key === "net_income")?.values.reduce((s, x) => s + x, 0) ?? 0;
  const netChange = f.cash.find((r) => r.key === "net_change")?.values.reduce((s, x) => s + x, 0) ?? 0;

  return (
    <>
      <MetricRow
        metrics={[
          { label: "Beginning cash", value: usd(f.opening.cents), note: f.opening.auto ? "QB ledger" : "manual" },
          { label: "12-mo revenue (budget)", value: usd(revenue) },
          { label: "12-mo net income", value: usd(ni), accent: ni < 0 },
          { label: "Ending cash (mo 12)", value: usd(endingLast), accent: endingLast < 0 },
        ]}
      />
      {revenue === 0 && (
        <p className="mt-3 text-[13px] text-accent-700">
          No budget figures found — the 12-month P&L is budget-driven. Create/lock a budget in Finance → Budgets to populate it.
        </p>
      )}
      <p className="mt-2 text-[12px] text-muted">Net change in cash over 12 months: {usd(netChange)}.</p>
      <div className="mt-6">
        <CashIndirect f={f} />
      </div>
    </>
  );
}
