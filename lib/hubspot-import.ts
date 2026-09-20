/**
 * Shared HubSpot import logic. Reads staged JSONL/JSON from a data directory and
 * upserts into the LAPS database (idempotent, keyed on HubSpot ids). Called both
 * by scripts/import-hubspot.ts (CLI) and the admin import route.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Stage, ProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";

const NO_DEAL_LABEL = "HubSpot — no deal";
const KNOWN_OWNER_EMAILS: Record<string, string> = {
  "Mark Edler": "mark@edlerzain.com",
};

type OwnerIn = { id: string; name: string; email?: string; active?: boolean };
type ContactIn = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  createdAt?: string | null;
  ownerId?: string | null;
};
type DealIn = {
  id: string;
  name?: string;
  stage?: string;
  amount?: string | number;
  closedate?: string | null;
  createdAt?: string | null;
  ownerId?: string | null;
  contactId?: string | null;
};

const STAGE_MAP: Record<string, { lead: Stage; status: ProposalStatus }> = {
  Prospecting: { lead: "NEW", status: "DRAFT" },
  "Call Booked": { lead: "APPOINTMENT", status: "DRAFT" },
  Qualified: { lead: "APPOINTMENT", status: "DRAFT" },
  "Audit Call Completed": { lead: "APPOINTMENT", status: "DRAFT" },
  "Contract Sent": { lead: "PROPOSAL", status: "SENT" },
  Negotiating: { lead: "PROPOSAL", status: "VIEWED" },
  "Closed Won": { lead: "CLOSED_WON", status: "WON" },
  "Closed Lost": { lead: "CLOSED_LOST", status: "LOST" },
};

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), "utf8")) as T;
}
function readJsonl<T>(dir: string, file: string): T[] {
  return readFileSync(join(dir, file), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}
function synthEmail(name: string, id: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  return slug ? `${slug}@edlerzain.com` : `hubspot-owner-${id}@import.local`;
}
function furthestStage(stages: Stage[]): Stage {
  const order: Stage[] = ["CLOSED_WON", "PROPOSAL", "APPOINTMENT", "NEW", "CLOSED_LOST"];
  for (const s of order) if (stages.includes(s)) return s;
  return "NEW";
}
async function chunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export type ImportCounts = {
  users: number;
  leads: number;
  noDealLeads: number;
  proposals: number;
  won: number;
  dealsSkippedNoContact: number;
};

export async function runHubspotImport(dataDir: string): Promise<ImportCounts> {
  const owners = readJson<OwnerIn[]>(dataDir, "owners.json");
  const contacts = readJsonl<ContactIn>(dataDir, "contacts.jsonl");
  const deals = readJsonl<DealIn>(dataDir, "deals.jsonl");

  // Owners -> Users (dedupe by name; map every ownerId -> userId)
  const ownerIdToUserId = new Map<string, string>();
  const byName = new Map<string, OwnerIn[]>();
  for (const o of owners) {
    if (!o.name || !o.name.trim()) continue;
    byName.set(o.name, [...(byName.get(o.name) ?? []), o]);
  }
  for (const [name, group] of byName) {
    const primary = group.find((g) => g.active) ?? group[0];
    const email = KNOWN_OWNER_EMAILS[name] || primary.email || synthEmail(name, primary.id);
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, hubspotOwnerId: primary.id },
      create: { email, name, role: name === "Mark Edler" ? "ADMIN" : "REP", hubspotOwnerId: primary.id },
    });
    for (const g of group) ownerIdToUserId.set(g.id, user.id);
  }

  const dealsByContact = new Map<string, DealIn[]>();
  for (const d of deals) {
    if (!d.contactId) continue;
    dealsByContact.set(d.contactId, [...(dealsByContact.get(d.contactId) ?? []), d]);
  }

  // Contacts -> Leads
  const contactIdToLeadId = new Map<string, string>();
  await chunked(contacts, 50, async (c) => {
    const cDeals = dealsByContact.get(c.id) ?? [];
    const stage = cDeals.length
      ? furthestStage(cDeals.map((d) => STAGE_MAP[d.stage ?? ""]?.lead ?? "NEW"))
      : "NEW";
    const leadSource = cDeals.length ? c.source || "HubSpot" : NO_DEAL_LABEL;
    const ownerId = c.ownerId ? ownerIdToUserId.get(c.ownerId) ?? null : null;
    const data = {
      firstName: c.firstName || "(unknown)",
      lastName: c.lastName || "",
      companyName: c.company || null,
      email: c.email || null,
      phone: c.phone || null,
      leadSource,
      stage: stage as Stage,
      ownerId,
      ...(c.createdAt ? { createdAt: new Date(c.createdAt) } : {}),
    };
    const lead = await prisma.lead.upsert({
      where: { hubspotId: c.id },
      update: data,
      create: { hubspotId: c.id, ...data },
    });
    contactIdToLeadId.set(c.id, lead.id);
  });

  // Deals -> Proposals (+ won handoffs)
  let skipped = 0;
  await chunked(deals, 40, async (d) => {
    const leadId = d.contactId ? contactIdToLeadId.get(d.contactId) : undefined;
    if (!leadId) {
      skipped++;
      return;
    }
    const map = STAGE_MAP[d.stage ?? ""] ?? { lead: "NEW" as Stage, status: "DRAFT" as ProposalStatus };
    const amount = Number(d.amount) || 0;
    const created = d.createdAt ? new Date(d.createdAt) : new Date();
    const closed = d.closedate ? new Date(d.closedate) : null;
    const ownerId = d.ownerId ? ownerIdToUserId.get(d.ownerId) ?? null : null;
    const dated = {
      sentAt: ["SENT", "VIEWED", "WON", "LOST"].includes(map.status) ? created : null,
      wonAt: map.status === "WON" ? closed ?? created : null,
      lostAt: map.status === "LOST" ? closed ?? created : null,
    };
    const proposal = await prisma.proposal.upsert({
      where: { hubspotId: d.id },
      update: { title: d.name || "Deal", status: map.status, ownerId, ...dated },
      create: {
        hubspotId: d.id,
        leadId,
        ownerId,
        title: d.name || "Deal",
        status: map.status,
        createdAt: created,
        ...dated,
      },
    });
    await prisma.proposalLineItem.deleteMany({ where: { proposalId: proposal.id } });
    await prisma.proposalLineItem.create({
      data: { proposalId: proposal.id, description: d.name || "Engagement", quantity: 1, unitPrice: amount },
    });
    if (map.status === "WON") {
      const existing = await prisma.handoff.findUnique({ where: { proposalId: proposal.id } });
      if (!existing) {
        await prisma.handoff.create({
          data: {
            proposalId: proposal.id,
            checklist: { create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({ label, sortOrder: idx })) },
          },
        });
      }
    }
  });

  return {
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    noDealLeads: await prisma.lead.count({ where: { leadSource: NO_DEAL_LABEL } }),
    proposals: await prisma.proposal.count(),
    won: await prisma.proposal.count({ where: { status: "WON" } }),
    dealsSkippedNoContact: skipped,
  };
}
