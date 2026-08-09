"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { GtdBucket } from "@prisma/client";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const GTD = ["INBOX", "NEXT", "WAITING", "SCHEDULED", "SOMEDAY"] as const;

const createSchema = z.object({
  description: z.string().min(1, "Task is required"),
  important: z.boolean().optional(),
  urgent: z.boolean().optional(),
  gtd: z.enum(GTD).optional(),
  context: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function createTask(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const assigneeId = await currentUserId();
  await prisma.actionItem.create({
    data: {
      description: d.description,
      important: d.important ?? false,
      urgent: d.urgent ?? false,
      gtd: (d.gtd as GtdBucket) ?? "INBOX",
      context: d.context || null,
      notes: d.notes || null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      assigneeId,
      source: "MANUAL",
    },
  });
  revalidatePath("/tasks");
  return { ok: true as const };
}

/** Patch any subset of a task's fields (quadrant drag, GTD move, edits). */
export async function updateTask(
  id: string,
  patch: Partial<{ important: boolean; urgent: boolean; gtd: GtdBucket; context: string | null; description: string; dueDate: string | null; notes: string | null }>,
) {
  await prisma.actionItem.update({
    where: { id },
    data: {
      ...(patch.important !== undefined ? { important: patch.important } : {}),
      ...(patch.urgent !== undefined ? { urgent: patch.urgent } : {}),
      ...(patch.gtd !== undefined ? { gtd: patch.gtd } : {}),
      ...(patch.context !== undefined ? { context: patch.context } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
    },
  });
  revalidatePath("/tasks");
  return { ok: true as const };
}

export async function setTaskDone(id: string, done: boolean) {
  await prisma.actionItem.update({ where: { id }, data: { status: done ? "DONE" : "OPEN" } });
  revalidatePath("/tasks");
  return { ok: true as const };
}

export async function deleteTask(id: string) {
  await prisma.actionItem.delete({ where: { id } });
  revalidatePath("/tasks");
  return { ok: true as const };
}
