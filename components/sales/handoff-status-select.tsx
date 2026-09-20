"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryStatus } from "@prisma/client";
import { Select } from "@/components/ui/select";
import { updateHandoffStatus } from "@/app/(dashboard)/sales/actions";

const STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: "PENDING", label: "Handoff Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETE", label: "Complete" },
];

export function HandoffStatusSelect({
  handoffId,
  status,
}: {
  handoffId: string;
  status: DeliveryStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      className="h-8 w-44 text-xs"
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateHandoffStatus(handoffId, e.target.value as DeliveryStatus);
          router.refresh();
        })
      }
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </Select>
  );
}
