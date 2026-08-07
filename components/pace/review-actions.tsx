"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Lock } from "lucide-react";
import { setPeriodStatusAction } from "@/app/(dashboard)/finance/actions";

export function ReviewActions({
  entityId,
  periodMonthISO,
  closed,
}: {
  entityId: string;
  periodMonthISO: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleClose() {
    startTransition(async () => {
      await setPeriodStatusAction(entityId, periodMonthISO, !closed);
      router.refresh();
    });
  }

  return (
    <div className="no-print flex items-center gap-2">
      <button className="btn btn-secondary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / PDF
      </button>
      <button className="btn btn-secondary" onClick={toggleClose} disabled={pending}>
        <Lock className="h-4 w-4" /> {closed ? "Reopen month" : "Mark month closed"}
      </button>
    </div>
  );
}
