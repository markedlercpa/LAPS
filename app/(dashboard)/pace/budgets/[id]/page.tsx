import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MicroLabel } from "@/components/micro-label";
import { BudgetGrid, type BudgetGridRow } from "@/components/pace/budget-grid";
import { getBudgetGrid } from "@/lib/pace/budgets";

export const dynamic = "force-dynamic";

export default async function BudgetEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grid = await getBudgetGrid(id);
  if (!grid) notFound();

  const rows: BudgetGridRow[] = grid.rows.map((r) => ({
    reportingAccountId: r.reportingAccountId,
    code: r.code,
    name: r.name,
    statement: r.statement,
    type: r.type,
    monthly: r.monthly,
  }));

  return (
    <div>
      <Link href="/pace/budgets" className="btn btn-ghost mb-4 -ml-1">
        <ArrowLeft className="h-4 w-4" /> Back to budgets
      </Link>
      <div className="mb-4">
        <MicroLabel>{grid.budget.entity.name} · FY{grid.budget.fiscalYear}</MicroLabel>
        <h1 className="mb-0 mt-1">
          {grid.budget.label}{" "}
          <span className={`tag ${grid.budget.status === "LOCKED" ? "tag-accent" : "tag-neutral"} align-middle`}>
            {grid.budget.status === "LOCKED" ? "Locked" : "Draft"}
          </span>
        </h1>
      </div>

      <BudgetGrid
        budgetId={grid.budget.id}
        months={grid.months}
        rows={rows}
        locked={grid.budget.status === "LOCKED"}
      />
    </div>
  );
}
