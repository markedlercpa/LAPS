import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewEntityButton } from "@/components/pace/new-entity";
import { EntityConnect } from "@/components/pace/entity-connect";
import { PROVIDER_LABELS, ENTITY_KIND_LABELS, type EntityKind } from "@/lib/pace-taxonomy";
import { qboConfigured } from "@/lib/pace/qbo";
import type { LedgerProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const entities = await prisma.entity.findMany({
    orderBy: { createdAt: "asc" },
    include: { connection: true, _count: { select: { periods: true, ledgerAccounts: true } } },
  });
  const qboOn = qboConfigured();

  return (
    <div>
      <PageHeader
        eyebrow="PACE — Finance"
        title="Entities & connections"
        description="Every company PACE tracks. Connect QuickBooks per entity, or run on manual trial-balance imports."
      >
        <NewEntityButton />
      </PageHeader>

      {!qboOn && (
        <p className="mb-4 text-[13px] text-accent-700">
          QuickBooks isn&apos;t configured yet (set QBO_CLIENT_ID / QBO_CLIENT_SECRET). Entities run on manual import until then.
        </p>
      )}

      {entities.length === 0 ? (
        <p className="text-[14px] text-muted">No entities yet. Add your first company to start.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Kind</th>
              <th>Ledger</th>
              <th>Status</th>
              <th className="num">Accounts</th>
              <th className="num">Periods</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id}>
                <td className="font-heading font-extrabold">{e.name}</td>
                <td className="text-muted">{ENTITY_KIND_LABELS[e.kind as EntityKind] ?? e.kind}</td>
                <td className="text-muted">{PROVIDER_LABELS[(e.connection?.provider ?? "MANUAL") as LedgerProvider]}</td>
                <td>
                  <span className={`tag ${e.connection?.status === "connected" ? "tag-accent" : "tag-neutral"}`}>
                    {e.connection?.status ?? "manual"}
                  </span>
                </td>
                <td className="num">{e._count.ledgerAccounts}</td>
                <td className="num">{e._count.periods}</td>
                <td className="text-right">
                  <EntityConnect entityId={e.id} qboConfigured={qboOn} connected={e.connection?.status === "connected"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
