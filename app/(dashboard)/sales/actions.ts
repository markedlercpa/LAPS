"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { DeliveryStatus } from "@prisma/client";

export async function updateHandoffStatus(handoffId: string, status: DeliveryStatus) {
  await prisma.handoff.update({
    where: { id: handoffId },
    data: { deliveryStatus: status },
  });
  revalidatePath("/sales");
  return { ok: true };
}

export async function toggleChecklistItem(itemId: string, done: boolean) {
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { done, completedAt: done ? new Date() : null },
  });
  revalidatePath("/sales");
  return { ok: true };
}

/** Add a handoff task to a won deal's checklist (sales-to-delivery handoff). */
export async function addChecklistItem(handoffId: string, label: string) {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false as const, error: "Task is empty" };
  const max = await prisma.checklistItem.aggregate({
    where: { handoffId },
    _max: { sortOrder: true },
  });
  await prisma.checklistItem.create({
    data: { handoffId, label: trimmed, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/sales");
  return { ok: true as const };
}
