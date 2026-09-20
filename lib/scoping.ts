import type { StaffLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STAFF_LEVELS, getRateCard } from "@/lib/rate-card";
import { computeScope, type ScopeLine } from "@/lib/scoping-math";

export { computeScope };
export type { ScopeLine, ScopeComputed } from "@/lib/scoping-math";

/**
 * Scoping engine. Estimated hours per staff level × the rate card produce budget
 * cost and budget revenue; an optional sales-value markup lifts budget revenue to
 * the quoted revenue (increasing realization). "Scoping drives the price": saving
 * the scope sets the proposal's delivery cost (= budget cost) and, by default, the
 * client-facing fee (= quoted revenue). Scoping numbers are internal — the client
 * only ever sees the resulting fee.
 */

export type ScopeLineInput = {
  level: StaffLevel;
  hours: number;
  costRate?: number;
  billRate?: number;
};

/** Ensure the 5 scoping lines exist, defaulting rates from the firm rate card. */
export async function ensureScopingLines(proposalId: string) {
  const existing = await prisma.scopingLine.findMany({ where: { proposalId } });
  if (existing.length >= STAFF_LEVELS.length) return;
  const rateCard = await getRateCard();
  for (let i = 0; i < STAFF_LEVELS.length; i++) {
    const level = STAFF_LEVELS[i];
    if (existing.some((e) => e.level === level)) continue;
    const r = rateCard.find((x) => x.level === level)!;
    await prisma.scopingLine.create({
      data: { proposalId, level, hours: 0, costRate: r.cost, billRate: r.bill, sortOrder: i },
    });
  }
}

async function readLines(proposalId: string): Promise<ScopeLine[]> {
  const rows = await prisma.scopingLine.findMany({ where: { proposalId } });
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  return STAFF_LEVELS.map((level) => {
    const r = byLevel.get(level);
    return {
      level,
      hours: r ? Number(r.hours) : 0,
      costRate: r ? Number(r.costRate) : 0,
      billRate: r ? Number(r.billRate) : 0,
    };
  });
}

/** Scoping view for the builder: lines + markup + computed totals. */
export async function getScopingView(proposalId: string) {
  await ensureScopingLines(proposalId);
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { salesMarkupEnabled: true, salesMarkupPct: true },
  });
  const lines = await readLines(proposalId);
  const markupEnabled = proposal?.salesMarkupEnabled ?? false;
  const markupPct = Number(proposal?.salesMarkupPct ?? 0);
  return { lines, markupEnabled, markupPct, computed: computeScope(lines, markupEnabled, markupPct) };
}

/**
 * Set the proposal's delivery cost (= budget cost) from the current scope and,
 * when the proposal isn't itemized (0-1 line items), set the client fee to the
 * quoted revenue. A rep who splits the fee into multiple line items keeps that.
 */
export async function applyScopeToPricing(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { title: true, salesMarkupEnabled: true, salesMarkupPct: true },
  });
  if (!proposal) return null;
  const lines = await readLines(proposalId);
  const c = computeScope(lines, proposal.salesMarkupEnabled, Number(proposal.salesMarkupPct));

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { estimatedDeliveryCost: c.budgetCost },
  });

  const items = await prisma.proposalLineItem.findMany({ where: { proposalId } });
  if (items.length <= 1 && c.quotedRevenue > 0) {
    await prisma.proposalLineItem.deleteMany({ where: { proposalId } });
    await prisma.proposalLineItem.create({
      data: {
        proposalId,
        description: `Professional services — ${proposal.title}`,
        quantity: 1,
        unitPrice: c.quotedRevenue,
        sortOrder: 0,
      },
    });
  }
  return c;
}

/** Save scope (hours/rates/markup) then apply it to the proposal's pricing. */
export async function saveScope(
  proposalId: string,
  input: { lines: ScopeLineInput[]; markupEnabled: boolean; markupPct: number },
) {
  await ensureScopingLines(proposalId);
  for (const l of input.lines) {
    await prisma.scopingLine.update({
      where: { proposalId_level: { proposalId, level: l.level } },
      data: {
        hours: l.hours,
        ...(l.costRate != null ? { costRate: l.costRate } : {}),
        ...(l.billRate != null ? { billRate: l.billRate } : {}),
      },
    });
  }
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { salesMarkupEnabled: input.markupEnabled, salesMarkupPct: input.markupPct },
  });
  return applyScopeToPricing(proposalId);
}

/** True once the scope has hours costed (gate for sending). */
export async function isScoped(proposalId: string): Promise<boolean> {
  const lines = await readLines(proposalId);
  const { budgetCost } = computeScope(lines, false, 0);
  return budgetCost > 0;
}
