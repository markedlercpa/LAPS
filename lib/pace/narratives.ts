import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

/**
 * Variance narratives — one-line explanations attached to a flagged variance
 * (entity + reporting account + month). Can be AI-drafted (Claude) then edited
 * and saved by a human. Over time the monthly operating review writes itself.
 */

function monthDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function upsertNote(input: {
  entityId: string;
  reportingAccountId: string;
  periodMonthISO: string;
  text: string;
  aiDrafted?: boolean;
  authorId?: string | null;
}) {
  const periodMonth = monthDate(input.periodMonthISO);
  return prisma.varianceNote.upsert({
    where: {
      entityId_reportingAccountId_periodMonth: {
        entityId: input.entityId,
        reportingAccountId: input.reportingAccountId,
        periodMonth,
      },
    },
    update: { text: input.text, aiDrafted: input.aiDrafted ?? false, authorId: input.authorId ?? null },
    create: {
      entityId: input.entityId,
      reportingAccountId: input.reportingAccountId,
      periodMonth,
      text: input.text,
      aiDrafted: input.aiDrafted ?? false,
      authorId: input.authorId ?? null,
    },
  });
}

/** All variance notes for an entity/month, keyed by reportingAccountId. */
export async function notesForMonth(entityId: string, periodMonthISO: string) {
  const notes = await prisma.varianceNote.findMany({
    where: { entityId, periodMonth: monthDate(periodMonthISO) },
  });
  return new Map(notes.map((n) => [n.reportingAccountId, n]));
}

export function narrativesConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * AI-draft a one-line variance explanation. Returns a draft the human edits and
 * saves — never auto-persisted. Degrades gracefully when Claude isn't configured.
 */
export async function draftNarrative(input: {
  accountName: string;
  actual: number;
  budget: number;
  varianceAmt: number;
  variancePct: number | null;
  favorable: boolean | null;
  periodLabel: string;
  entityName: string;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!narrativesConfigured()) return { ok: false, error: "Assistant not configured (ANTHROPIC_API_KEY)." };

  const dir = input.favorable === null ? "" : input.favorable ? " (favorable)" : " (unfavorable)";
  const pct = input.variancePct === null ? "n/a" : `${(input.variancePct * 100).toFixed(0)}%`;
  const prompt = [
    `You are a CPA firm's FP&A analyst writing a variance note for ${input.entityName}, ${input.periodLabel}.`,
    `Account: ${input.accountName}.`,
    `Actual ${formatCurrency(input.actual)} vs budget ${formatCurrency(input.budget)} — variance ${formatCurrency(input.varianceAmt)} (${pct})${dir}.`,
    "Write ONE concise sentence (max ~25 words) giving the most likely operating explanation for this variance, phrased as a plausible hypothesis a controller would confirm. No preamble, no bullet, just the sentence.",
  ].join("\n");

  try {
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_AGENT_MODEL || "claude-opus-5";
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text ? { ok: true, text } : { ok: false, error: "Empty draft." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Draft failed." };
  }
}
