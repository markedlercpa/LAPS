/**
 * Import HubSpot contacts + deals into LAPS.
 *
 * Reads staged JSONL/JSON exported from HubSpot (see scripts/README or the
 * migration run) and upserts into the LAPS database via Prisma. Idempotent:
 * keyed on HubSpot ids (Lead.hubspotId / Proposal.hubspotId / User.hubspotOwnerId),
 * so re-running updates rather than duplicating.
 *
 * Usage:  HUBSPOT_DATA_DIR=/path/to/export tsx scripts/import-hubspot.ts
 * Env:    DATABASE_URL (target), HUBSPOT_DATA_DIR (default ./hubspot-export)
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, Stage, ProposalStatus } from "@prisma/client";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "../lib/constants";

const prisma = new PrismaClient();
const DATA_DIR = process.env.HUBSPOT_DATA_DIR || "./hubspot-export";
const NO_DEAL_LABEL = "HubSpot — no deal";

// Known real emails for owners (others are synthesized from the name).
const KNOWN_OWNER_EMAILS: Record<string, string> = {
  "Mark Edler": "mark@edlerzain.com",
};

type OwnerIn = { id: string; name: string; email?: string; active?: boolean };
type ContactIn = {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  createdAt?: string;
  ownerId?: string;
};
type DealIn = {
  id: string;
  name?: string;
  stage?: string; // HubSpot stage LABEL
  pipeline?: string;
  amount?: string | number;
  closedate?: string;
  createdAt?: string;
  ownerId?: string;
  contactId?: string;
};

// HubSpot stage label -> LAPS lead stage + proposal status
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

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
}
function readJsonl<T>(file: string): T[] {
  return readFileSync(join(DATA_DIR, file), "utf8")
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
    if (i % (size * 20) === 0 && i > 0) console.log(`  …${i}/${items.length}`);
  }
}

async function main() {
  const owners = readJson<OwnerIn[]>("owners.json");
  const contacts = readJsonl<ContactIn>("contacts.jsonl");
  const deals = readJsonl<DealIn>("deals.jsonl");
  console.log(`Loaded ${owners.length} owners, ${contacts.length} contacts, ${deals.length} deals`);

  // ---- Owners -> Users (dedupe by name; map every ownerId -> userId) ----
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
      create: {
        email,
        name,
        role: name === "Mark Edler" ? "ADMIN" : "REP",
        hubspotOwnerId: primary.id,
      },
    });
    for (const g of group) ownerIdToUserId.set(g.id, user.id);
  }
  console.log(`Upserted ${byName.size} users`);

  // ---- Index deals by contact for stage rollup ----
  const dealsByContact = new Map<string, DealIn[]>();
  for (const d of deals) {
    if (!d.contactId) continue;
    dealsByContact.set(d.contactId, [...(dealsByContact.get(d.contactId) ?? []), d]);
  }

  // ---- Contacts -> Leads ----
  const contactIdToLeadId = new Map<string, string>();
  await chunked(contacts, 40, async (c) => {
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
  console.log(`Upserted ${contactIdToLeadId.size} leads`);

  // ---- Deals -> Proposals (+ won handoffs) ----
  let skipped = 0;
  await chunked(deals, 30, async (d) => {
    const leadId = d.contactId ? contactIdToLeadId.get(d.contactId) : undefined;
    if (!leadId) {
      skipped++;
      return;
    }
    const map = STAGE_MAP[d.stage ?? ""] ?? { lead: "NEW", status: "DRAFT" as ProposalStatus };
    const amount = Number(d.amount) || 0;
    const created = d.createdAt ? new Date(d.createdAt) : new Date();
    const closed = d.closedate ? new Date(d.closedate) : null;
    const ownerId = d.ownerId ? ownerIdToUserId.get(d.ownerId) ?? null : null;

    const proposal = await prisma.proposal.upsert({
      where: { hubspotId: d.id },
      update: {
        title: d.name || "Deal",
        status: map.status,
        ownerId,
        sentAt: ["SENT", "VIEWED", "WON", "LOST"].includes(map.status) ? created : null,
        wonAt: map.status === "WON" ? closed ?? created : null,
        lostAt: map.status === "LOST" ? closed ?? created : null,
      },
      create: {
        hubspotId: d.id,
        leadId,
        ownerId,
        title: d.name || "Deal",
        status: map.status,
        createdAt: created,
        sentAt: ["SENT", "VIEWED", "WON", "LOST"].includes(map.status) ? created : null,
        wonAt: map.status === "WON" ? closed ?? created : null,
        lostAt: map.status === "LOST" ? closed ?? created : null,
      },
    });

    // one line item = the deal amount (idempotent: replace)
    await prisma.proposalLineItem.deleteMany({ where: { proposalId: proposal.id } });
    await prisma.proposalLineItem.create({
      data: { proposalId: proposal.id, description: d.name || "Engagement", quantity: 1, unitPrice: amount },
    });

    // won -> handoff + checklist (only if missing)
    if (map.status === "WON") {
      const existing = await prisma.handoff.findUnique({ where: { proposalId: proposal.id } });
      if (!existing) {
        await prisma.handoff.create({
          data: {
            proposalId: proposal.id,
            checklist: {
              create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({ label, sortOrder: idx })),
            },
          },
        });
      }
    }
  });

  const counts = {
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    noDealLeads: await prisma.lead.count({ where: { leadSource: NO_DEAL_LABEL } }),
    proposals: await prisma.proposal.count(),
    won: await prisma.proposal.count({ where: { status: "WON" } }),
    dealsSkippedNoContact: skipped,
  };
  console.log("Import complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
