import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { MicroLabel } from "@/components/micro-label";
import { ReviewActions } from "@/components/pace/review-actions";
import { buildStatement, availableMonths } from "@/lib/pace/statements";
import { computeVariance } from "@/lib/pace/variance";
import { notesForMonth } from "@/lib/pace/narratives";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; budget?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const entities = await prisma.entity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const entityId = sp.entity ?? entities[0]?.id ?? "";

  const [budgets, months] = await Promise.all([
    entityId ? prisma.budget.findMany({ where: { entityId }, orderBy: [{ fiscalYear: "desc" }] }) : Promise.resolve([]),
    entityId ? availableMonths(entityId) : Promise.resolve([]),
  ]);
  const budgetId = sp.budget ?? budgets[0]?.id ?? "";
  const month = sp.month ?? months[0] ?? "";
  const entity = entities.find((e) => e.id === entityId);

  let is = null, variance = null, notes = new Map(), period = null;
  if (entityId && month) {
    [is, period] = await Promise.all([
      buildStatement(entityId, month, "IS"),
      prisma.trialBalancePeriod.findUnique({
        where: { entityId_periodMonth: { entityId, periodMonth: new Date(month) } },
        select: { status: true, balanced: true },
      }),
    ]);
    if (budgetId) {
      variance = await computeVariance({ entityId, budgetId, periodMonthISO: month, basis: "month" });
      notes = await notesForMonth(entityId, month);
    }
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Finance — Expectations"
          title="Operating review"
          description="The monthly pack: statements, budget-vs-actual, and the variance narratives — assembled from what you've captured. Print to PDF for the review."
        />
        {entities.length > 0 && (
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="field"><span className="micro-label">Entity</span>
              <select name="entity" defaultValue={entityId} className="input">
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="micro-label">Budget</span>
              <select name="budget" defaultValue={budgetId} className="input">
                {budgets.length === 0 && <option value="">— none —</option>}
                {budgets.map((b) => <option key={b.id} value={b.id}>FY{b.fiscalYear} · {b.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="micro-label">Month</span>
              <select name="month" defaultValue={month} className="input">
                {months.length === 0 && <option value="">— no actuals —</option>}
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <button className="btn btn-secondary" type="submit">View</button>
          </form>
        )}
      </div>

      {!entity || !month || !is ? (
        <p className="text-[14px] text-muted">Pick an entity and a month with actuals loaded.</p>
      ) : (
        <div className="reader-panel">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <MicroLabel>Operating Review</MicroLabel>
              <h1 className="mb-0 mt-1">{entity.name} — {monthLabel(month)}</h1>
              <p className="mb-0 text-muted">
                {period?.status === "CLOSED" ? "Month closed" : "Month open (in progress)"}
                {period && !period.balanced ? " · trial balance out of balance" : ""}
              </p>
            </div>
            <ReviewActions entityId={entityId} periodMonthISO={month} closed={period?.status === "CLOSED"} />
          </div>

          {variance && (
            <MetricRow
              metrics={[
                { label: "Revenue", value: formatCurrency(variance.subtotals.Revenue?.actual ?? 0), note: `Budget ${formatCurrency(variance.subtotals.Revenue?.budget ?? 0)}` },
                { label: "COGS", value: formatCurrency(variance.subtotals.COGS?.actual ?? 0) },
                { label: "OpEx", value: formatCurrency(variance.subtotals.OpEx?.actual ?? 0) },
                { label: "Net income", value: formatCurrency(is.subtotals.netIncome ?? 0), accent: true },
              ]}
            />
          )}

          {/* Income statement */}
          <div className="mt-8">
            <MicroLabel>Income statement — {monthLabel(month)}</MicroLabel>
            <table className="table mt-2">
              <thead><tr><th>Account</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {is.lines.map((l) => (
                  <tr key={l.reportingAccountId}><td>{l.name}</td><td className="num">{formatCurrency(l.amount)}</td></tr>
                ))}
                <tr><td className="font-heading font-extrabold">Net income</td><td className="num font-heading font-extrabold">{formatCurrency(is.subtotals.netIncome ?? 0)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Budget-vs-actual exceptions with narratives */}
          {variance && (
            <div className="mt-8">
              <MicroLabel>Budget vs. actual — flagged variances</MicroLabel>
              {variance.materialRows.length === 0 ? (
                <p className="mt-2 text-[14px] text-muted">No material variances this month.</p>
              ) : (
                <table className="table mt-2">
                  <thead><tr><th>Account</th><th className="num">Actual</th><th className="num">Budget</th><th className="num">Variance</th><th>Explanation</th></tr></thead>
                  <tbody>
                    {variance.materialRows.map((r) => (
                      <tr key={r.reportingAccountId}>
                        <td>{r.name}</td>
                        <td className="num">{formatCurrency(r.actual)}</td>
                        <td className="num">{formatCurrency(r.budget)}</td>
                        <td className={`num ${r.favorable === false ? "text-accent" : "text-accent-700"}`}>{formatCurrency(r.varianceAmt)}</td>
                        <td className="text-[13px]">{(notes.get(r.reportingAccountId) as { text: string } | undefined)?.text ?? <span className="text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!budgetId && <p className="mt-2 text-[13px] text-muted">Select a budget to include budget-vs-actual.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
