import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { MappingTable, type LedgerAccountRow, type ReportingOption } from "@/components/pace/mapping-table";
import { listReportingAccounts } from "@/lib/pace/coa";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const [accounts, reporting] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { active: true },
      orderBy: [{ mappedReportingAccountId: "asc" }, { name: "asc" }],
      include: { entity: { select: { name: true } } },
    }),
    listReportingAccounts(),
  ]);

  const rows: LedgerAccountRow[] = accounts.map((a) => ({
    id: a.id,
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
      <div className="mb-4 flex gap-2">
        <span className={`tag ${unmapped > 0 ? "tag-outline" : "tag-accent"}`}>
          {unmapped} unmapped
        </span>
        <span className="tag tag-neutral">{rows.length} accounts</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">No source accounts yet. Import a trial balance to populate the COA.</p>
      ) : (
        <MappingTable rows={rows} options={options} />
      )}
    </div>
  );
}
