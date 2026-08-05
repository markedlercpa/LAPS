"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  rows: z.array(
    z.object({
      level: z.enum(["ASSOCIATE", "SENIOR", "MANAGER", "DIRECTOR", "PARTNER"]),
      cost: z.coerce.number().min(0),
      bill: z.coerce.number().min(0),
    }),
  ),
});

/** Update the firm-wide standard rate card (cost + billing rate per level). */
export async function updateRateCard(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid rates" };
  for (let i = 0; i < parsed.data.rows.length; i++) {
    const r = parsed.data.rows[i];
    await prisma.rateCardLevel.upsert({
      where: { level: r.level },
      update: { cost: r.cost, bill: r.bill, sortOrder: i },
      create: { level: r.level, cost: r.cost, bill: r.bill, sortOrder: i },
    });
  }
  revalidatePath("/settings");
  return { ok: true as const };
}
