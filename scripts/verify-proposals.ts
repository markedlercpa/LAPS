/**
 * Local verification for the proposal e-sign flow. Exercises the real Prisma
 * models + the shared markProposalWon cascade against the dev DB, then cleans up.
 * Run: tsx scripts/verify-proposals.ts
 */
import { prisma } from "../lib/prisma";
import { markProposalWon } from "../lib/proposals";
import { stripeConfigured, getStripe } from "../lib/stripe";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "../lib/constants";
import { randomUUID } from "crypto";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ok:", msg);
}

async function main() {
  // Use a throwaway lead so we don't disturb imported data.
  const lead = await prisma.lead.create({
    data: {
      firstName: "Test",
      lastName: "Signer",
      companyName: "Verify Co",
      email: "test.signer@example.com",
      leadSource: "Verification",
      stage: "PROPOSAL",
    },
  });

  const token = randomUUID();
  const proposal = await prisma.proposal.create({
    data: {
      leadId: lead.id,
      title: "Verification Proposal",
      status: "DRAFT",
      estimatedDeliveryCost: 4000,
      coverLetter: "Hello and thanks.",
      scopeNarrative: "We will do the work.",
      termsText: "Standard terms.",
      paymentScheduleType: "DEPOSIT_THEN_BALANCE",
      publicToken: token,
      lineItems: {
        create: [
          { description: "Setup", quantity: 1, unitPrice: 5000, sortOrder: 0 },
          { description: "Monthly", quantity: 6, unitPrice: 1000, sortOrder: 1 },
        ],
      },
      payments: {
        create: [
          { description: "Deposit on signing", amount: 5000, dueOn: "On signing", sortOrder: 0 },
          { description: "Balance", amount: 6000, dueOn: "Net 30", sortOrder: 1 },
        ],
      },
    },
  });

  // Simulate a client view.
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: "SENT" },
  });
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { viewedAt: new Date(), status: "VIEWED" },
  });

  // The public page's exact select — must NOT be able to include margin.
  const pub = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      coverLetter: true,
      scopeNarrative: true,
      termsText: true,
      paymentScheduleType: true,
      lineItems: { select: { description: true, quantity: true, unitPrice: true } },
      payments: { select: { description: true, amount: true, dueOn: true } },
    },
  });
  assert(pub, "public select returns the proposal by token");
  assert(!("estimatedDeliveryCost" in (pub as object)), "public payload has no estimatedDeliveryCost (margin)");
  assert(pub!.lineItems.length === 2, "public payload includes line items");
  assert(pub!.payments.length === 2, "public payload includes payment schedule");

  // Sign it (e-sign cascade).
  const res = await markProposalWon(proposal.id, {
    name: "Jane A. Client",
    email: "jane@verify.co",
    ip: "203.0.113.9",
    userAgent: "VerifyAgent/1.0",
  });
  assert(res.ok, "markProposalWon succeeded");

  const after = await prisma.proposal.findUnique({
    where: { id: proposal.id },
    include: { handoff: { include: { checklist: true } }, lead: true },
  });
  assert(after!.status === "WON", "status is WON after signing");
  assert(after!.signerName === "Jane A. Client", "signerName captured");
  assert(after!.signedIp === "203.0.113.9", "signer IP captured");
  assert(after!.signedAt instanceof Date, "signedAt stamped");
  assert(after!.wonAt instanceof Date, "wonAt stamped");
  assert(after!.lead.stage === "CLOSED_WON", "lead moved to CLOSED_WON");
  assert(after!.handoff, "handoff created");
  assert(
    after!.handoff!.checklist.length === ONBOARDING_CHECKLIST_TEMPLATE.length,
    `onboarding checklist seeded (${ONBOARDING_CHECKLIST_TEMPLATE.length} items)`,
  );

  // Idempotency: signing again should not duplicate the handoff.
  await markProposalWon(proposal.id, { name: "Jane A. Client" });
  const handoffs = await prisma.handoff.count({ where: { proposalId: proposal.id } });
  assert(handoffs === 1, "re-signing does not duplicate the handoff");

  // Stripe gating: without a key, the app runs sign-only (no deposit blocking).
  assert(stripeConfigured() === false, "stripe not configured locally (sign-only fallback)");
  assert(getStripe() === null, "getStripe() returns null without a secret key");
  assert(
    after!.paymentStatus === "NONE",
    "sign-only path leaves paymentStatus NONE (no deposit collected)",
  );

  // Cleanup (cascades remove line items, payments, handoff, checklist).
  await prisma.proposal.delete({ where: { id: proposal.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  console.log("\nAll proposal e-sign checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
