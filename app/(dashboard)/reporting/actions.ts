"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { saveSalesTarget, type Period, type TargetSet } from "@/lib/reporting";

/** Save one period's targets (admin/rep gated by session presence). */
export async function saveTargetAction(
  granularity: Period,
  startKey: string,
  values: TargetSet,
) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in" };
  await saveSalesTarget(granularity, startKey, values);
  revalidatePath("/reporting");
  return { ok: true as const };
}
