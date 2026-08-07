"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteBudgetAction } from "@/app/(dashboard)/finance/budget-actions";

/** Delete a budget version (with confirm). Locked budgets are rejected server-side. */
export function DeleteBudgetButton({ budgetId, label }: { budgetId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function del() {
    if (!confirm(`Delete budget "${label}"? This removes the version and all its lines. This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteBudgetAction(budgetId);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <button
      className="btn btn-ghost btn-icon"
      onClick={del}
      disabled={pending}
      aria-label="Delete budget"
      title="Delete budget"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
