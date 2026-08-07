import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { VarianceView, type VarianceViewRow } from "@/components/pace/variance-view";
import { computeVariance, basisMonths, type Basis } from "@/lib/pace/variance";
import { notesForMonth, narrativesConfigured } from "@/lib/pace/narratives";
import { availableMonths } from "@/lib/pace/statements";

export const dynamic = "force-dynamic";

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function periodLabel(iso: string, basis: Basis): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  if (basis === "ytd") return `${y} YTD through ${monthLabel(iso)}`;
  if (basis === "qtd") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y} QTD`;
  return monthLabel(iso);
}

export default async function VariancePage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; budget?: string; month?: string; basis?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const entities = await prisma.entity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const entityId = sp.entity ?? entities[0]?.id ?? "";

  const [budgets, months] = await Promise.all([
    entityId ? prisma.budget.findMany({ where: { entityId }, orderBy: [{ fiscalYear: "desc" }, { createdAt: "asc" }] }) : Promise.resolve([]),
    entityId ? availableMonths(entityId) : Promise.resolve([]),
  ]);

  const budgetId = sp.budget ?? budgets[0]?.id ?? "";
  const month = sp.month ?? months[0] ?? "";
  const basis = (["month", "qtd", "ytd"].includes(sp.basis ?? "") ? sp.basis : "month") as Basis;
  const exceptionOnly = sp.all !== "1";

  let viewRows: VarianceViewRow[] = [];
  let subtotals: Record<string, { actual: number; budget: number; varianceAmt: number }> = {};
  if (entityId && budgetId && month) {
    const result = await computeVariance({ entityId, budgetId, periodMonthISO: month, basis });
    const noteMap = await notesForMonth(entityId, month);
    subtotals = result.subtotals;
    const source = exceptionOnly ? result.materialRows : result.rows.filter((r) => r.actual !== 0 || r.budget !== 0);
    viewRows = source.map((r) => ({
      ...r,
      note: noteMap.get(r.reportingAccountId)?.text ?? null,
    }));
  }

  const entityName = entities.find((e) => e.id === entityId)?.name ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="PACE — Expectations"
        title="Budget vs. actual"
        description="Exception-first variance against a locked budget version. Flag threshold: $5,000 or 10%. Explain flagged variances inline — the operating review assembles from these."
      />

      {entities.length === 0 ? (
        <p className="text-[14px] text-muted">Add an entity and import actuals first.</p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <Field label="Entity">
              <select name="entity" defaultValue={entityId} className="input">
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Budget version">
              <select name="budget" defaultValue={budgetId} className="input">
                {budgets.length === 0 && <option value="">— none —</option>}
                {budgets.map((b) => <option key={b.id} value={b.id}>FY{b.fiscalYear} · {b.label}</option>)}
              </select>
            </Field>
            <Field label="Month">
              <select name="month" defaultValue={month} className="input">
                {months.length === 0 && <option value="">— no actuals —</option>}
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </Field>
            <Field label="Basis">
              <select name="basis" defaultValue={basis} className="input">
                <option value="month">Month</option>
                <option value="qtd">Quarter-to-date</option>
                <option value="ytd">Year-to-date</option>
              </select>
            </Field>
            <Field label="Show">
              <select name="all" defaultValue={exceptionOnly ? "0" : "1"} className="input">
                <option value="0">Exceptions only</option>
                <option value="1">All lines</option>
              </select>
            </Field>
            <button className="btn btn-secondary" type="submit">View</button>
          </form>

          {!budgetId ? (
            <p className="text-[14px] text-muted">No budget for this entity yet — create one under Budgets.</p>
          ) : !month ? (
            <p className="text-[14px] text-muted">No actuals loaded for this entity.</p>
          ) : (
            <VarianceView
              entityId={entityId}
              entityName={entityName}
              periodMonthISO={month}
              periodLabel={periodLabel(month, basis)}
              rows={viewRows}
              subtotals={subtotals}
              exceptionOnly={exceptionOnly}
              aiEnabled={narrativesConfigured()}
            />
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="micro-label">{label}</span>
      {children}
    </label>
  );
}
