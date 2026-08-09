"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@prisma/client";
import { Select } from "@/components/ui/select";
import { STAGE_LABELS } from "@/lib/constants";
import { updateLeadStage } from "@/app/(dashboard)/leads/actions";

const STAGES: Stage[] = ["NEW", "APPOINTMENT", "PROPOSAL", "CLOSED_WON", "CLOSED_LOST"];

export function LeadStageSelect({ leadId, stage }: { leadId: string; stage: Stage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={stage}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Stage;
        startTransition(async () => {
          await updateLeadStage(leadId, next);
          router.refresh();
        });
      }}
    >
      {STAGES.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}
