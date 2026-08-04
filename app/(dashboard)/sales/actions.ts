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
