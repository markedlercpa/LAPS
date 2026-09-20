import type { Engagement, StapleStage } from "@prisma/client";
import { nextStage } from "@/lib/staple-taxonomy";

/**
 * Stage gates. A gate is a pure check of the engagement's state that must pass
 * before it can advance. Phase 1 implements the Staging→Takeoff gate in full;
 * later gates are placeholders that pass (their real checklists arrive with the
 * corresponding phase). Every advance is still recorded as a StageTransition.
 */

export type GateResult = { ok: boolean; reasons: string[] };

/** Can this engagement leave its current stage for `to`? */
export function gateFor(engagement: Engagement, to: StapleStage): GateResult {
  const expected = nextStage(engagement.stage);
  if (to !== expected) {
    return {
      ok: false,
      reasons: [`Can only advance to the next stage (${expected ?? "none"}).`],
    };
  }

  switch (engagement.stage) {
    case "STAGING": {
      const reasons: string[] = [];
      if (!engagement.accepted) reasons.push("Delivery lead has not accepted the handoff.");
      if (!engagement.ownerId) reasons.push("Engagement is not staffed (no owner assigned).");
      return { ok: reasons.length === 0, reasons };
    }
    // Later phases attach real gates here (Takeoff: terms confirmed + blocking
    // info received; Assemble: all tasks prepared + tie-outs; Package: reviewer
    // sign-off + delivery sent).
    default:
      return { ok: true, reasons: [] };
  }
}
