import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { qboConfigured, pullArAging, pullApAging, type AgingItem } from "@/lib/pace/qbo";

/**
 * QBO AR/AP aging as an editable forecast input. Each open item gets a stable
 * key so a user's override (expected collection/payment date, or exclude)
 * persists across re-pulls. The cash forecast and the Assumptions worktable both
 * read through here so what you edit is exactly what spreads.
 */

export type AgingKind = "AR" | "AP";

/** Deterministic key for an open item — stable across re-pulls of the report. */
export function agingItemKey(kind: AgingKind, entityId: string, item: AgingItem): string {
  const cents = Math.round(item.amount * 100);
  const raw = `${kind}|${entityId}|${(item.name ?? "").trim().toLowerCase()}|${(item.docNumber ?? "").trim()}|${cents}`;
  return `${kind.toLowerCase()}_${createHash("sha256").update(raw).digest("hex").slice(0, 20)}`;
}

export type AgingOverride = { expectedDate: string | null; excluded: boolean };

/** The date an item actually spreads on: user override → due date → txn date. */
export function effectiveAgingDate(item: AgingItem, override?: AgingOverride | null): string | null {
  if (override?.expectedDate) return override.expectedDate;
  return item.dueDate ?? item.txnDate ?? null;
}

export type AgingRow = {
  itemKey: string;
  kind: AgingKind;
  entityId: string;
  entity: string;
  name: string;
  docNumber: string | null;
  txnDate: string | null;
  dueDate: string | null;
  amount: number; // dollars, positive
  expectedDate: string | null; // effective date used for spreading (editable)
  overridden: boolean;
  excluded: boolean;
};

export type AgingList = {
  qboConfigured: boolean;
  connectedEntities: number;
  ar: AgingRow[];
  ap: AgingRow[];
  arParsed: number;
  apParsed: number;
};

async function overrideMap(): Promise<Map<string, AgingOverride>> {
  const rows = await prisma.cashAgingOverride.findMany();
  return new Map(rows.map((r) => [r.itemKey, { expectedDate: r.expectedDate ? r.expectedDate.toISOString().slice(0, 10) : null, excluded: r.excluded }]));
}

/** Pull AR + AP across connected QBO entities and attach overrides — the data
 * behind the Assumptions worktable. */
export async function listAging(): Promise<AgingList> {
  const out: AgingList = { qboConfigured: qboConfigured(), connectedEntities: 0, ar: [], ap: [], arParsed: 0, apParsed: 0 };
  if (!out.qboConfigured) return out;

  const [conns, overrides] = await Promise.all([
    prisma.ledgerConnection.findMany({ where: { provider: "QBO", status: "connected" }, select: { entityId: true, entity: { select: { name: true } } } }),
    overrideMap(),
  ]);
  out.connectedEntities = conns.length;

  for (const c of conns) {
    const [ar, ap] = await Promise.all([pullArAging(c.entityId), pullApAging(c.entityId)]);
    const build = (items: AgingItem[] | null, kind: AgingKind): AgingRow[] =>
      (items ?? []).map((it) => {
        const itemKey = agingItemKey(kind, c.entityId, it);
        const ov = overrides.get(itemKey);
        return {
          itemKey,
          kind,
          entityId: c.entityId,
          entity: c.entity.name,
          name: it.name,
          docNumber: it.docNumber ?? null,
          txnDate: it.txnDate ?? null,
          dueDate: it.dueDate ?? null,
          amount: it.amount,
          expectedDate: effectiveAgingDate(it, ov),
          overridden: Boolean(ov?.expectedDate),
          excluded: ov?.excluded ?? false,
        };
      });
    const arRows = build(ar, "AR");
    const apRows = build(ap, "AP");
    out.ar.push(...arRows);
    out.ap.push(...apRows);
    out.arParsed += ar?.length ?? 0;
    out.apParsed += ap?.length ?? 0;
  }

  out.ar.sort((a, b) => (a.expectedDate ?? "").localeCompare(b.expectedDate ?? ""));
  out.ap.sort((a, b) => (a.expectedDate ?? "").localeCompare(b.expectedDate ?? ""));
  return out;
}

/** Override lookup for the forecast: itemKey → { expectedDate, excluded }. */
export function getAgingOverrides(): Promise<Map<string, AgingOverride>> {
  return overrideMap();
}

export async function setAgingOverride(input: { itemKey: string; kind: AgingKind; expectedDate: string | null; excluded: boolean }) {
  const data = {
    kind: input.kind,
    expectedDate: input.expectedDate ? new Date(`${input.expectedDate}T00:00:00Z`) : null,
    excluded: input.excluded,
  };
  await prisma.cashAgingOverride.upsert({
    where: { itemKey: input.itemKey },
    update: data,
    create: { itemKey: input.itemKey, ...data },
  });
  return { ok: true as const };
}
