import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { queryGeneralLedger, glMonths } from "@/lib/pace/gl";
import { listReportingAccounts } from "@/lib/pace/coa";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; account?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;

  const [entities, months, reporting] = await Promise.all([
    prisma.entity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    glMonths(),
    listReportingAccounts(),
  ]);

  const entitySel = sp.entity ?? "all";
  const accountSel = sp.account ?? "";
  const fromSel = sp.from ?? (months[months.length - 1] ?? "");
  const toSel = sp.to ?? (months[0] ?? "");

  const hasData = months.length > 0;
  const { rows, total, count } = hasData
    ? await queryGeneralLedger({
        entityId: entitySel === "all" ? null : entitySel,
        reportingAccountId: accountSel || undefined,
        fromMonth: fromSel || undefined,
        toMonth: toSel || undefined,
        limit: 1000,
      })
    : { rows: [], total: 0, count: 0 };

  return (
    <div>
      <PageHeader
        eyebrow="PACE — Actuals"
        title="General ledger"
        description="Transaction-level detail behind the statements — for drill-down and bottoms-up forecasting. Pulled from QuickBooks by the Actuals sync."
      />

      {!hasData ? (
        <p className="text-[14px] text-muted">
          No general-ledger data yet. Go to <a className="text-accent-700" href="/pace/actuals">Actuals</a> and click
          “Sync from QBO” — it pulls trial balances and the transaction-level GL together.
        </p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="field">
              <span className="micro-label">Entity</span>
              <select name="entity" defaultValue={entitySel} className="input">
                <option value="all">All entities</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Reporting account</span>
              <select name="account" defaultValue={accountSel} className="input">
                <option value="">All accounts</option>
                <optgroup label="Income Statement">
                  {reporting.filter((r) => r.statement === "IS").map((r) => (
                    <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ""}{r.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Balance Sheet">
                  {reporting.filter((r) => r.statement === "BS").map((r) => (
                    <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ""}{r.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="field">
              <span className="micro-label">From</span>
              <select name="from" defaultValue={fromSel} className="input">
                {months.slice().reverse().map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">To</span>
              <select name="to" defaultValue={toSel} className="input">
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary" type="submit">View</button>
          </form>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="tag tag-neutral">{count.toLocaleString()} transactions</span>
            <span className={`tag ${Math.abs(total) < 0.005 ? "tag-neutral" : "tag-outline"}`}>
              Net {formatCurrency(total)}
            </span>
            {count > rows.length && <span className="tag tag-outline">Showing first {rows.length.toLocaleString()}</span>}
          </div>

          {rows.length === 0 ? (
            <p className="text-[14px] text-muted">No transactions match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Num</th>
                    <th>Name</th>
                    <th>Memo</th>
                    <th>Account</th>
                    <th>Reporting</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{r.txnDate}</td>
                      <td className="text-muted">{r.txnType ?? "—"}</td>
                      <td className="text-muted">{r.docNumber ?? ""}</td>
                      <td>{r.name ?? ""}</td>
                      <td className="text-muted">{r.memo ?? ""}</td>
                      <td className="whitespace-nowrap">
                        {r.sourceAcctNum ? <span className="text-muted">{r.sourceAcctNum} · </span> : null}
                        {r.sourceAccount ?? "—"}
                      </td>
                      <td className="text-muted">{r.reportingAccount ?? <span className="text-accent-700">unmapped</span>}</td>
                      <td className="num">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
