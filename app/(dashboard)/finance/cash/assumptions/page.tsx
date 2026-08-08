import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CashAssumptions } from "@/components/pace/cash-assumptions";
import { CashLines, type CashLineRow } from "@/components/pace/cash-lines";
import { getCashConfig, listCashLines, latestCashActualCents } from "@/lib/pace/cash";

export const dynamic = "force-dynamic";

export default async function CashAssumptionsPage() {
  const [config, lines, actual] = await Promise.all([getCashConfig(), listCashLines(), latestCashActualCents()]);
  const today = new Date().toISOString().slice(0, 10);

  const values = {
    useQboOpening: config?.useQboOpening ?? true,
    opening: (config?.openingCents ?? 0) / 100,
    openingAsOf: config?.openingAsOf ? config.openingAsOf.toISOString().slice(0, 10) : today,
    minCash: (config?.minCashCents ?? 0) / 100,
    locLimit: (config?.locLimitCents ?? 0) / 100,
    locOpening: (config?.locOpeningCents ?? 0) / 100,
    dnaMonthly: (config?.dnaMonthlyCents ?? 0) / 100,
    capexMonthly: (config?.capexMonthlyCents ?? 0) / 100,
    arDays: config?.arDays ?? 45,
    apDays: config?.apDays ?? 30,
  };

  const lineRows: CashLineRow[] = lines.map((l) => ({
    id: l.id,
    label: l.label,
    category: l.category,
    amount: l.amountCents / 100,
    cadence: l.cadence,
    startDate: l.startDate.toISOString().slice(0, 10),
    endDate: l.endDate ? l.endDate.toISOString().slice(0, 10) : null,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Finance — Cash"
        title="Assumptions"
        description="The drivers behind the forecast: opening cash source, liquidity/LOC, indirect-method assumptions, and the manual cash lines that fill each statement category."
      >
        <Link href="/finance/cash?mode=weekly" className="btn btn-secondary">Back to forecast</Link>
      </PageHeader>

      <CashAssumptions
        values={values}
        qboOpening={actual != null ? Math.round(actual.cents / 100) : null}
        qboAsOf={actual?.asOf ?? null}
      />

      <div className="mt-8">
        <div className="micro-label mb-2">Manual cash lines</div>
        <CashLines rows={lineRows} />
      </div>
    </div>
  );
}
