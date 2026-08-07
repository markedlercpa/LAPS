import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MetricRow } from "@/components/metric-row";
import { ImportTbButton } from "@/components/pace/import-tb";
import { QboSyncButton } from "@/components/pace/qbo-sync";
import { buildStatement, availableMonths, type StatementResult } from "@/lib/pace/statements";
import { ensureReportingCoaSeeded } from "@/lib/pace/coa";
import { formatCurrency } from "@/lib/utils";
import { qboConfigured } from "@/lib/pace/qbo";

export const dynamic = "force-dynamic";

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ActualsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; month?: string; view?: string }>;
}) {
  await ensureReportingCoaSeeded();
  const sp = await searchParams;

  const entities = await prisma.entity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const months = await availableMonths();
  const entitySel = sp.entity ?? (entities[0]?.id ?? "");
  const monthSel = sp.month ?? (months[0] ?? "");
  const view = sp.view === "bs" ? "BS" : "IS";
  const consolidated = entitySel === "all";

  let statement: StatementResult | null = null;
  let period: { balanced: boolean; status: string; source: string } | null = null;
  if (monthSel && (consolidated || entitySel)) {
    statement = await buildStatement(consolidated ? null : entitySel, monthSel, view);
    if (!consolidated) {
      const p = await prisma.trialBalancePeriod.findUnique({
        where: { entityId_periodMonth: { entityId: entitySel, periodMonth: new Date(monthSel) } },
        select: { balanced: true, status: true, source: true },
      });
      period = p;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finance — Actuals"
        title="Financial statements"
        description="P&L and Balance Sheet from cached trial balances — per entity or consolidated. Every figure ties to the loaded TB."
      >
        {entitySel && entitySel !== "all" && (
          <>
            {qboConfigured() && <QboSyncButton entityId={entitySel} />}
            <ImportTbButton entityId={entitySel} />
          </>
        )}
      </PageHeader>

      {entities.length === 0 ? (
        <p className="text-[14px] text-muted">
          No entities yet. Add one under <a className="text-accent-700" href="/finance/entities">Entities</a> and import a trial balance.
        </p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="field">
              <span className="micro-label">Entity</span>
              <select name="entity" defaultValue={entitySel} className="input">
                <option value="all">Consolidated</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Month</span>
              <select name="month" defaultValue={monthSel} className="input">
                {months.length === 0 && <option value="">— no data —</option>}
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Statement</span>
              <select name="view" defaultValue={view === "BS" ? "bs" : "is"} className="input">
                <option value="is">Income Statement</option>
                <option value="bs">Balance Sheet</option>
              </select>
            </label>
            <button className="btn btn-secondary" type="submit">View</button>
          </form>

          {!statement || statement.lines.length === 0 ? (
            <p className="text-[14px] text-muted">
              {qboConfigured() && entitySel !== "all"
                ? "No trial balances loaded yet. Click “Sync from QBO” to pull the last two years of actuals from QuickBooks — that also fills the month picker. Or use “Import trial balance” to paste one manually."
                : "No trial balance loaded for this selection. Use “Import trial balance” to add one."}
            </p>
          ) : (
            <StatementBlock
              statement={statement}
              period={period}
              consolidated={consolidated}
              entityParam={consolidated ? "all" : entitySel}
            />
          )}
        </>
      )}
    </div>
  );
}

function StatementBlock({
  statement,
  period,
  consolidated,
  entityParam,
}: {
  statement: StatementResult;
  period: { balanced: boolean; status: string; source: string } | null;
  consolidated: boolean;
  entityParam: string;
}) {
  const ym = statement.periodMonth.slice(0, 7); // "YYYY-MM"
  const s = statement.subtotals;
  const metrics =
    statement.statement === "IS"
      ? [
          { label: "Revenue", value: formatCurrency(s.revenue ?? 0) },
          { label: "Gross Profit", value: formatCurrency(s.grossProfit ?? 0) },
          { label: "Operating Income", value: formatCurrency(s.operatingIncome ?? 0) },
          { label: "Net Income", value: formatCurrency(s.netIncome ?? 0), accent: true },
        ]
      : [
          { label: "Assets", value: formatCurrency(s.assets ?? 0) },
          { label: "Liabilities", value: formatCurrency(s.liabilities ?? 0) },
          { label: "Equity", value: formatCurrency(s.equity ?? 0) },
          { label: "A − (L+E)", value: formatCurrency(s.checkDiff ?? 0), accent: Math.abs(s.checkDiff ?? 0) > 0.5 },
        ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {period && (
          <span className={`tag ${period.balanced ? "tag-accent" : "tag-outline"}`}>
            {period.balanced ? "Balanced" : "Out of balance"}
          </span>
        )}
        {period && <span className="tag tag-neutral">{period.status === "CLOSED" ? "Closed" : "Open"}</span>}
        {period && <span className="tag tag-neutral">Source: {period.source}</span>}
        {consolidated && <span className="tag tag-outline">Consolidated</span>}
        {statement.unmappedAmount !== 0 && (
          <span className="tag tag-outline">
            Unmapped: {formatCurrency(statement.unmappedAmount)} — resolve in <a className="text-accent-700" href="/finance/mapping">COA mapping</a>
          </span>
        )}
      </div>

      <MetricRow metrics={metrics} />

      <table className="table mt-5">
        <thead>
          <tr>
            <th>Account</th>
            <th>Category</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((l) => (
            <tr key={l.reportingAccountId}>
              <td>
                <a
                  className="text-accent-700"
                  href={`/finance/ledger?entity=${entityParam}&account=${l.reportingAccountId}&from=${ym}&to=${ym}`}
                  title="Drill into the transactions behind this line"
                >
                  {l.name}
                </a>
              </td>
              <td className="text-muted">{l.category ?? l.type}</td>
              <td className="num">{formatCurrency(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
