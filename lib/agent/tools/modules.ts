import type { StapleStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type AgentTool, str } from "@/lib/agent/tool-kit";
import { STAGE_LABELS } from "@/lib/staple-taxonomy";

/** Marketing (ECHO) + Delivery (STAPLE) read tools. */

// ── Marketing ────────────────────────────────────────────────────────────────
const listEvidence: AgentTool = {
  name: "marketing_list_evidence",
  description: "List Marketing evidence records (proof/insights harvested for content), newest first, with type and a distilled snippet.",
  mode: "read",
  input_schema: { type: "object", properties: { limit: { type: "integer", description: "Max rows (default 25)." } } },
  run: async (input) => {
    const take = Math.min(Number(input.limit) || 25, 100);
    const rows = await prisma.evidenceRecord.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, type: true, distilled: true, rawText: true, strength: true, createdAt: true } });
    return {
      ok: true,
      count: rows.length,
      evidence: rows.map((r) => ({ id: r.id, type: r.type, snippet: (r.distilled ?? r.rawText).slice(0, 140), strength: r.strength, when: r.createdAt })),
    };
  },
};

const listContent: AgentTool = {
  name: "marketing_list_content",
  description: "List Marketing content items (housed content), newest first, with status and channel.",
  mode: "read",
  input_schema: { type: "object", properties: { limit: { type: "integer", description: "Max rows (default 25)." } } },
  run: async (input) => {
    const take = Math.min(Number(input.limit) || 25, 100);
    const rows = await prisma.contentItem.findMany({ orderBy: { updatedAt: "desc" }, take, select: { id: true, title: true, status: true, channel: true, updatedAt: true } });
    return { ok: true, count: rows.length, content: rows.map((r) => ({ id: r.id, title: r.title, status: r.status, channel: r.channel, updated: r.updatedAt })) };
  },
};

// ── Delivery (STAPLE) ────────────────────────────────────────────────────────
const listDelivery: AgentTool = {
  name: "delivery_list_engagements",
  description: "List STAPLE delivery engagements (won work moving through the delivery stages) with client, service line, and stage.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { stage: { type: "string", description: "Optional stage filter (e.g. STAGING, TAKEOFF, DELIVERED)." } },
  },
  run: async (input) => {
    const stageRaw = str(input, "stage");
    const stage = stageRaw && stageRaw in STAGE_LABELS ? (stageRaw as StapleStage) : undefined;
    const rows = await prisma.engagement.findMany({
      where: stage ? { stage } : {},
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { client: { select: { legalName: true } } },
    });
    return { ok: true, count: rows.length, engagements: rows.map((e) => ({ id: e.id, client: e.client.legalName, serviceLine: e.serviceLine, stage: e.stage, accepted: e.accepted })) };
  },
};

export const MODULE_TOOLS: AgentTool[] = [listEvidence, listContent, listDelivery];
