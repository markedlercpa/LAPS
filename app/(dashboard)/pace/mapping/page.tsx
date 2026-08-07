import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MappingTable, type LedgerAccountRow, type ReportingOption } from "@/components/pace/mapping-table";
import { SyncQboAccountsButton } from "@/components/pace/sync-qbo-accounts";
import { listReportingAccounts } from "@/lib/pace/coa";
import { qboConfigured } from "@/lib/pace/qbo";

export const dynamic = "force-dynamic";

/** Numeric-aware account-number sort: "1000" < "9000" < "10000", blanks last. */
function byAcctNum(a: { acctNum: string | null; name: string }, b: { acctNum: string | null; name: string }): number {
  const an = a.acctNum ?? "";
  const bn = b.acctNum ?? "";
  if (an && bn) {
    const na = Number(an);
    const nb = Number(bn);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (an !== bn) return an.localeCompare(bn);
  } else if (an !== bn) {
    return an ? -1 : 1; // numbered accounts first
  }
  return a.name.localeCompare(b.name);
}

export default async function MappingPage() {
  const [accounts, reporting] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { active: true },
      include: { entity: { select: { name: true } } },
    }),
    listReportingAccounts(),
  ]);

  const hasQbo =
    qboConfigured() &&
    (await prisma.ledgerConnection.count({ where: { provider: "QBO", status: "connected" } })) > 0;

  const rows: LedgerAccountRow[] = accounts
    .slice()
    .sort(byAcctNum)
    .map((a) => ({
      id: a.id,
      acctNum: a.acctNum,
      name: a.name,
      entity: a.entity.name,
      mappedReportingAccountId: a.mappedReportingAccountId,
    }));
  const options: ReportingOption[] = reporting.map((r) => ({
    id: r.id,
    label: `${r.code ? r.code + " · " : ""}${r.name}`,
    statement: r.statement,
  }));
  const unmapped = rows.filter((r) => !r.mappedReportingAccountId).length;

  return (
    <div>
      <PageHeader
        eyebrow="PACE — Actuals"
        title="COA mapping"
        description="Map each entity's source accounts to the firm-standard reporting chart of accounts. Unmapped accounts are the exception queue — nothing is dropped, but unmapped amounts don't land on statements."
      />
      <div className="mb-4 flex items-center gap-2">
        <span className={`tag ${unmapped > 0 ? "tag-outline" : "tag-accent"}`}>
          {unmapped} unmapped
        </span>
        <span className="tag tag-neutral">{rows.length} accounts</span>
        {hasQbo && <SyncQboAccountsButton />}
      </div>
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">No source accounts yet. Import a trial balance to populate the COA.</p>
      ) : (
        <MappingTable rows={rows} options={options} />
      )}
    </div>
  );
}
