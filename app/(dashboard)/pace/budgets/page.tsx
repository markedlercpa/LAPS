import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewBudgetButton } from "@/components/pace/new-budget";
import { ImportQboBudgetButton } from "@/components/pace/import-qbo-budget";
import { DeleteBudgetButton } from "@/components/pace/delete-budget";
import { qboConfigured } from "@/lib/pace/qbo";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { ORIGINAL: "Original", REFORECAST: "Reforecast", SCENARIO: "Scenario" };

export default async function BudgetsPage() {
  const [entities, budgets] = await Promise.all([
    prisma.entity.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, connection: { select: { provider: true, status: true } } },
    }),
    prisma.budget.findMany({
      orderBy: [{ fiscalYear: "desc" }, { createdAt: "asc" }],
      include: { entity: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
  ]);
  const qboEntities =
    qboConfigured()
      ? entities.filter((e) => e.connection?.provider === "QBO" && e.connection?.status === "connected").map((e) => ({ id: e.id, name: e.name }))
      : [];

  return (
    <div>
      <PageHeader
        eyebrow="PACE — Expectations"
        title="Budgets"
        description="Plan by reporting-COA line, per entity and fiscal year. Versions are lockable; reforecasts and scenarios are new versions — nothing is overwritten."
      >
        <ImportQboBudgetButton entities={qboEntities} />
        <NewBudgetButton
          entities={entities.map((e) => ({ id: e.id, name: e.name }))}
          budgets={budgets.map((b) => ({ id: b.id, label: `${b.entity.name} · ${b.label}` }))}
        />
      </PageHeader>

      {budgets.length === 0 ? (
        <p className="text-[14px] text-muted">
          {entities.length === 0
            ? "Add an entity first (Entities), then create a budget."
            : "No budgets yet. Create one to start planning."}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Fiscal year</th>
              <th>Version</th>
              <th>Kind</th>
              <th>Status</th>
              <th className="num">Lines</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.id}>
                <td className="font-heading font-extrabold">
                  <Link href={`/pace/budgets/${b.id}`} className="text-accent-700">{b.entity.name}</Link>
                </td>
                <td>{b.fiscalYear}</td>
                <td>{b.label}</td>
                <td className="text-muted">{KIND_LABELS[b.kind] ?? b.kind}</td>
                <td>
                  <span className={`tag ${b.status === "LOCKED" ? "tag-accent" : "tag-neutral"}`}>
                    {b.status === "LOCKED" ? "Locked" : "Draft"}
                  </span>
                </td>
                <td className="num">{b._count.lines}</td>
                <td className="text-right">
                  <DeleteBudgetButton budgetId={b.id} label={`${b.entity.name} · ${b.label}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
