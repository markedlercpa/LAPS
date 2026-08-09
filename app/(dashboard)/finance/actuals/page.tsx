import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatementMulti } from "@/components/pace/statement-multi";
import { buildStatementColumns, availableMonths, COLUMN_LABELS, type ColumnKey } from "@/lib/pace/statements";
import { formatCurrency } from "@/lib/utils";
import { qboConfigured } from "@/lib/pace/qbo";
import { ImportTbButton } from "@/components/pace/import-tb";
import { QboSyncButton } from "@/components/pace/qbo-sync";

function StatementSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5">
      {Array.from({ length: 14 }).map((_, i) => <div key={i} className="h-7 rounded-sm bg-surface" />)}
      <p className="pt-1 text-[12px] text-muted">Loading statement…</p>
    </div>
  );
}

/** The heavy statement build, streamed so the header + filters paint first. */
async function StatementSection({
  entityId, consolidated, asOf, view, cols,
}: {
  entityId: string; consolidated: boolean; asOf: string; view: "IS" | "BS"; cols: ColumnKey[];
}) {
  const [data, period] = await Promise.all([
    buildStatementColumns(consolidated ? null : entityId, asOf, view, cols),
    !consolidated
      ? prisma.trialBalancePeriod.findUnique({
          where: { entityId_periodMonth: { entityId, periodMonth: new Date(`${asOf}-01`) } },
          select: { balanced: true, status: true, source: true },
        })
      : Promise.resolve(null),
  ]);

  if (!data || data.groups.length === 0) {
    return (
      <p className="text-[14px] text-muted">
        {qboConfigured() && !consolidated
          ? "No trial balances loaded yet. Click “Sync from QBO” to pull actuals — that also fills the month picker."
          : "No trial balance loaded for this selection. Use “Import trial balance” to add one."}
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {period && <span className={`tag ${period.balanced ? "tag-accent" : "tag-outline"}`}>{period.balanced ? "Balanced" : "Out of balance"}</span>}
        {period && <span className="tag tag-neutral">{period.status === "CLOSED" ? "Closed" : "Open"}</span>}
        {period && <span className="tag tag-neutral">Source: {period.source}</span>}
        {consolidated && <span className="tag tag-outline">Consolidated</span>}
        {Math.abs(data.unclassifiedAmount[0] ?? 0) >= 0.5 && (
          <span className="tag tag-outline" title="Accounts QuickBooks didn't tag with an AccountType.">
            Unclassified: {formatCurrency(data.unclassifiedAmount[0])}
          </span>
        )}
      </div>
      <StatementMulti data={data} entityParam={consolidated ? "all" : entityId} />
    </>
  );
}

export const dynamic = "force-dynamic";

const IS_COLUMNS: ColumnKey[] = ["month", "ytd", "ttm", "priorYear", "deltaYoY", "deltaYoYPct"];
const BS_COLUMNS: ColumnKey[] = ["month", "priorMonth", "priorYear", "deltaYoY"];
const DEFAULT_IS: ColumnKey[] = ["month", "ytd", "ttm"];
const DEFAULT_BS: ColumnKey[] = ["month", "priorYear"];

function monthLabel(iso: string): string {
  const d = new Date(`${iso}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ActualsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; month?: string; view?: string; cols?: string }>;
}) {
  const sp = await searchParams;

  const entities = await prisma.entity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const entitySel = sp.entity ?? (entities[0]?.id ?? "");
  const consolidated = entitySel === "all";
  const months = await availableMonths(consolidated ? undefined : entitySel || undefined);
  const asOfFull = sp.month ?? (months[0] ?? "");
  const asOf = asOfFull.slice(0, 7); // "YYYY-MM"
  const view = sp.view === "bs" ? "BS" : "IS";

  const available = view === "IS" ? IS_COLUMNS : BS_COLUMNS;
  const requested = sp.cols
    ? sp.cols.split(",").filter((c): c is ColumnKey => available.includes(c as ColumnKey))
    : view === "IS" ? DEFAULT_IS : DEFAULT_BS;
  const cols = requested.length ? requested : [available[0]];

  const hasSelection = !!(asOf && (consolidated || entitySel));

  return (
    <div>
      <PageHeader
        eyebrow="Finance — Actuals"
        title="Financial statements"
        description="P&L and Balance Sheet rebuilt natively from the QuickBooks chart of accounts. Collapse sections, pick the period columns (Month / YTD / TTM / prior year / Δ), and drill any line to its transactions."
      >
        {entitySel && !consolidated && (
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
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">As of month</span>
              <select name="month" defaultValue={asOf} className="input">
                {months.length === 0 && <option value="">— no data —</option>}
                {months.map((m) => <option key={m} value={m.slice(0, 7)}>{monthLabel(m.slice(0, 7))}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Statement</span>
              <select name="view" defaultValue={view === "BS" ? "bs" : "is"} className="input">
                <option value="is">Income Statement</option>
                <option value="bs">Balance Sheet</option>
              </select>
            </label>
            <div className="field">
              <span className="micro-label">Columns</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5">
                {available.map((c) => (
                  <label key={c} className="flex items-center gap-1 text-[12px]">
                    <input type="checkbox" name="cols" value={c} defaultChecked={cols.includes(c)} /> {COLUMN_LABELS[c]}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn btn-secondary" type="submit">View</button>
          </form>

          {!hasSelection ? (
            <p className="text-[14px] text-muted">
              {qboConfigured() && !consolidated
                ? "No trial balances loaded yet. Click “Sync from QBO” to pull actuals — that also fills the month picker."
                : "No trial balance loaded for this selection. Use “Import trial balance” to add one."}
            </p>
          ) : (
            <Suspense key={`${entitySel}-${asOf}-${view}-${cols.join(",")}`} fallback={<StatementSkeleton />}>
              <StatementSection entityId={entitySel} consolidated={consolidated} asOf={asOf} view={view} cols={cols} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
