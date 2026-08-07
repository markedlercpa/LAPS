"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import type { StapleStage } from "@prisma/client";
import { acceptEngagement, advanceEngagement } from "@/app/(dashboard)/staple/actions";

/**
 * Staging acceptance + stage-advance control. Shows the gate's blocking reasons
 * inline when the next stage can't be entered yet.
 */
export function StageControl({
  engagementId,
  nextStage,
  nextStageLabel,
  accepted,
  gateOk,
  gateReasons,
}: {
  engagementId: string;
  stageLabel: string;
  nextStage: StapleStage | null;
  nextStageLabel: string | null;
  accepted: boolean;
  gateOk: boolean;
  gateReasons: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    startTransition(async () => {
      await acceptEngagement(engagementId);
      router.refresh();
    });
  }

  function advance() {
    if (!nextStage) return;
    setError(null);
    startTransition(async () => {
      const res = await advanceEngagement(engagementId, nextStage);
      if (!res.ok) setError(res.reasons?.join(" ") ?? "Blocked by stage gate.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {!accepted && (
          <button className="btn btn-secondary" onClick={accept} disabled={pending}>
            <Check className="h-4 w-4" /> Accept handoff
          </button>
        )}
        {nextStage && (
          <button className="btn btn-primary" onClick={advance} disabled={pending || !gateOk} title={gateOk ? "" : gateReasons.join(" ")}>
            Advance to {nextStageLabel} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {!gateOk && nextStage && (
        <ul className="max-w-[280px] text-right text-[12px] text-accent-700">
          {gateReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12px] text-accent-700">{error}</p>}
    </div>
  );
}
