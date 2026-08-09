"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentStatus } from "@prisma/client";
import { Select } from "@/components/ui/select";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { updateAppointmentStatus } from "@/app/(dashboard)/appointments/actions";

const STATUSES: AppointmentStatus[] = ["BOOKED", "COMPLETED", "NO_SHOW", "CANCELED"];

export function AppointmentStatusSelect({
  id,
  status,
}: {
  id: string;
  status: AppointmentStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      className="h-8 w-36 text-xs"
      value={status}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as AppointmentStatus;
        startTransition(async () => {
          await updateAppointmentStatus(id, next);
          router.refresh();
        });
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {APPOINTMENT_STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}
