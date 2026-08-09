/**
 * Throwaway smoke test for STAPLE Phase 1. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-staple.ts
 * Creates throwaway data and cleans it all up.
 */
import { prisma } from "@/lib/prisma";
import {
  createEngagementManual,
  createEngagementFromWon,
  acceptStaging,
  advanceStage,
} from "@/lib/staple/engagements";
import { addInfoItem, markReceived } from "@/lib/staple/registry";
import { storageConfigured, putObject } from "@/lib/staple/storage";

const TAG = "ZZZStaple";

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user to act as.");
  console.log(`Acting as ${user.email}\n`);

  const createdClientIds: string[] = [];
  const createdLeadIds: string[] = [];
  const createdProposalIds: string[] = [];

  // 1. Manual intake → STAGING + terms v1 + seeded registry
  const m = await createEngagementManual({
    legalName: `${TAG} Manual Co`,
    serviceLine: "qofe_buyside",
    ownerId: user.id,
    contactName: "Test Contact",
    contactEmail: "zzz-staple@example.com",
    fee: 25000,
  });
  createdClientIds.push(m.clientId);
  const eng = await prisma.engagement.findUnique({
    where: { id: m.engagementId },
    include: { terms: true, infoItems: true },
  });
  console.log(`create_manual → stage=${eng?.stage} terms=v${eng?.terms[0]?.version} info=${eng?.infoItems.length}`);
  if (eng?.stage !== "STAGING") throw new Error("expected STAGING");
  if (!eng.terms.length) throw new Error("expected terms v1");
  if (!eng.infoItems.length) throw new Error("expected seeded registry");

  // 2. Gate: advance blocked until accepted, then passes + writes a transition
  const blocked = await advanceStage(m.engagementId, "TAKEOFF", user.id);
  console.log(`advance (not accepted) → ok=${blocked.ok} reasons=${JSON.stringify(blocked.reasons)}`);
  if (blocked.ok) throw new Error("expected gate to block un-accepted engagement");

  await acceptStaging(m.engagementId, user.id);
  const advanced = await advanceStage(m.engagementId, "TAKEOFF", user.id);
  const after = await prisma.engagement.findUnique({
    where: { id: m.engagementId },
    include: { transitions: true },
  });
  console.log(`advance (accepted) → ok=${advanced.ok} stage=${after?.stage} transitions=${after?.transitions.length}`);
  if (!advanced.ok || after?.stage !== "TAKEOFF") throw new Error("expected advance to TAKEOFF");
  if (!after?.transitions.length) throw new Error("expected a StageTransition");

  // 3. InfoItem add + mark received
  const info = await addInfoItem({ clientId: m.clientId, engagementId: m.engagementId, label: `${TAG} GL detail` });
  const rec = await markReceived(info.id);
  console.log(`info add → ${info.status}; markReceived → ${rec.status}`);
  if (rec.status !== "RECEIVED") throw new Error("expected RECEIVED");

  // 4. createEngagementFromWon — idempotent
  const lead = await prisma.lead.create({
    data: { firstName: TAG, lastName: "Won", companyName: `${TAG} Won Co`, email: "zzz-staple-won@example.com", stage: "CLOSED_WON", ownerId: user.id },
  });
  createdLeadIds.push(lead.id);
  const proposal = await prisma.proposal.create({
    data: { leadId: lead.id, ownerId: user.id, title: `${TAG} Proposal`, status: "WON", estimatedDeliveryCost: 40000, scopeNarrative: "Buyside QofE scope." },
  });
  createdProposalIds.push(proposal.id);

  const w1 = await createEngagementFromWon(proposal.id);
  const w2 = await createEngagementFromWon(proposal.id);
  console.log(`fromWon #1 created=${w1.created} id=${w1.engagementId}`);
  console.log(`fromWon #2 created=${w2.created} id=${w2.engagementId} (idempotent)`);
  if (!w1.created) throw new Error("expected first fromWon to create");
  if (w2.created || w2.engagementId !== w1.engagementId) throw new Error("expected idempotent second call");
  if (w1.clientId) createdClientIds.push(w1.clientId);

  // 5. Storage off → graceful
  const put = await putObject("test/key", Buffer.from("x"));
  console.log(`storageConfigured=${storageConfigured()} putObject.ok=${put.ok} (${put.error ?? ""})`);
  if (storageConfigured() !== false && put.ok !== true) throw new Error("storage state inconsistent");

  // Cleanup (client cascade removes engagements/terms/infoitems/transitions).
  for (const id of createdClientIds) await prisma.stapleClient.delete({ where: { id } }).catch(() => {});
  for (const id of createdProposalIds) await prisma.proposal.delete({ where: { id } }).catch(() => {});
  for (const id of createdLeadIds) await prisma.lead.delete({ where: { id } }).catch(() => {});
  console.log("\ncleaned up throwaway rows");

  console.log("\n✅ STAPLE smoke passed");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
