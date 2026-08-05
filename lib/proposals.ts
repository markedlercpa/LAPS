import { randomUUID } from "crypto";
import type { ProposalStatus, PaymentScheduleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "@/lib/constants";
import { getStripe } from "@/lib/stripe";
import { graphConfigured, sendMailAsUser } from "@/lib/graph";
import { isScoped, getScopingView } from "@/lib/scoping";
import {
  ensureProposalTemplatesSeeded,
  type TemplateLineItem,
  type TemplatePayment,
} from "@/lib/proposal-templates";

export function appBaseUrl() {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export type Signer = {
  name?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Mark a proposal as Won and run the Sales-Closed cascade: move the lead to
 * CLOSED_WON and create the Handoff seeded with the onboarding checklist (once).
 * When `signer` is provided (client e-signature), stamp the signature audit
 * fields. Idempotent — safe to call again on an already-won proposal.
 *
 * Shared by the internal status control (proposals/actions.ts) and the public
 * e-sign flow (app/p/[token]/actions.ts).
 */
export async function markProposalWon(proposalId: string, signer?: Signer) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { handoff: true },
  });
  if (!proposal) return { ok: false as const, error: "Proposal not found" };

  const now = new Date();

  // Always capture signature details if this call carries them, even if the
  // proposal was already won by another path.
  const signerData = signer
    ? {
        signedAt: proposal.signedAt ?? now,
        signerName: signer.name ?? proposal.signerName,
        signerEmail: signer.email ?? proposal.signerEmail,
        signedIp: signer.ip ?? proposal.signedIp,
        signedUserAgent: signer.userAgent ?? proposal.signedUserAgent,
      }
    : {};

  if (proposal.status === "WON") {
    if (signer) {
      await prisma.proposal.update({ where: { id: proposalId }, data: signerData });
    }
    return { ok: true as const };
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "WON", wonAt: proposal.wonAt ?? now, ...signerData },
  });

  await prisma.lead.update({
    where: { id: proposal.leadId },
    data: { stage: "CLOSED_WON" },
  });

  if (!proposal.handoff) {
    await prisma.handoff.create({
      data: {
        proposalId,
        checklist: {
          create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({
            label,
            sortOrder: idx,
          })),
        },
      },
    });
  }

  return { ok: true as const };
}

/**
 * Confirm a paid Stripe Checkout Session and finalize the proposal: stamp the
 * payment, complete the signature, and run the WON cascade. Idempotent — safe
 * for both the success-return confirmation and the webhook to call. Resolves the
 * proposal from the session's metadata (or its stored session id).
 */
export async function finalizeDepositPaid(sessionId: string) {
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, error: "Stripe not configured" };

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return { ok: false as const, error: "Payment not completed" };
  }

  const proposalId = session.metadata?.proposalId;
  const proposal = proposalId
    ? await prisma.proposal.findUnique({ where: { id: proposalId } })
    : await prisma.proposal.findUnique({ where: { stripeSessionId: sessionId } });
  if (!proposal) return { ok: false as const, error: "Proposal not found" };

  const now = new Date();
  const amountPaid =
    session.amount_total != null ? session.amount_total / 100 : undefined;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      paymentStatus: "PAID",
      amountPaid: amountPaid ?? proposal.amountPaid ?? undefined,
      paidAt: proposal.paidAt ?? now,
      stripePaymentIntentId: paymentIntentId ?? proposal.stripePaymentIntentId,
      signedAt: proposal.signedAt ?? now,
    },
  });

  // Signer fields were captured when the client clicked to sign; the WON cascade
  // (lead -> CLOSED_WON + onboarding handoff) is idempotent.
  await markProposalWon(proposal.id);
  return { ok: true as const };
}

/**
 * Prefill a proposal from a full template: title, all document sections, payment
 * schedule, and a fresh set of line items + payment rows (replaces existing).
 * Shared by the builder UI and the agent API.
 */
export async function applyProposalTemplate(proposalId: string, templateKey: string) {
  await ensureProposalTemplatesSeeded();
  const template = await prisma.proposalTemplate.findUnique({ where: { key: templateKey } });
  if (!template) return { ok: false as const, error: "Template not found" };

  const lineItems = (template.lineItems as unknown as TemplateLineItem[]) ?? [];
  const payments = (template.payments as unknown as TemplatePayment[]) ?? [];

  await prisma.$transaction([
    prisma.proposalLineItem.deleteMany({ where: { proposalId } }),
    prisma.proposalPayment.deleteMany({ where: { proposalId } }),
    prisma.proposal.update({
      where: { id: proposalId },
      data: {
        title: template.defaultTitle,
        coverLetter: template.coverLetter,
        scopeNarrative: template.scopeNarrative,
        termsText: template.termsText,
        paymentScheduleType: template.paymentScheduleType,
        recurringInterval: template.recurringInterval,
        // Auto-attach the matching sample deliverable for this service line.
        ...(template.demoKey ? { demoKey: template.demoKey } : {}),
        ...(template.defaultDeliveryCost != null
          ? { estimatedDeliveryCost: template.defaultDeliveryCost }
          : {}),
      },
    }),
    prisma.proposalLineItem.createMany({
      data: lineItems.map((li, i) => ({
        proposalId,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        sortOrder: i,
      })),
    }),
    prisma.proposalPayment.createMany({
      data: payments.map((p, i) => ({
        proposalId,
        description: p.description,
        amount: p.amount,
        dueOn: p.dueOn,
        sortOrder: i,
      })),
    }),
  ]);
  return { ok: true as const };
}

/**
 * Core "send" logic shared by the dashboard action and the agent API: generate
 * the public token, mark SENT, and email the client link via Graph as `actorUserId`
 * (falls back to the proposal owner). Degrades gracefully when Graph is off —
 * still returns the link. Does not revalidate (callers handle their own caches).
 */
export async function sendProposalCore(proposalId: string, actorUserId: string | null) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: true, lead: true },
  });
  if (!proposal) return { ok: false as const, error: "Proposal not found" };
  if (!(await isScoped(proposalId))) {
    return {
      ok: false as const,
      error: "Complete the scoping card (estimated hours) before sending.",
    };
  }
  if (!proposal.demoKey) {
    return {
      ok: false as const,
      error: "Attach a sample deliverable (demo) before sending.",
    };
  }
  if (proposal.lineItems.length === 0) {
    return { ok: false as const, error: "Add at least one line item before sending." };
  }

  const token = proposal.publicToken ?? randomUUID();
  const now = new Date();
  const openStatuses: ProposalStatus[] = ["DRAFT", "SENT", "VIEWED"];
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      publicToken: token,
      status: openStatuses.includes(proposal.status) ? "SENT" : proposal.status,
      sentAt: proposal.sentAt ?? now,
    },
  });

  const link = `${appBaseUrl()}/p/${token}`;
  let emailed = false;
  let emailError: string | undefined;
  const senderId = actorUserId ?? proposal.ownerId;
  if (graphConfigured() && proposal.lead.email && senderId) {
    const clientName = proposal.lead.firstName || "there";
    const html = `
      <p>Hi ${clientName},</p>
      <p>Your proposal <strong>${proposal.title}</strong> from Edler Zain is ready to review and sign.</p>
      <p><a href="${link}">Review &amp; sign your proposal</a></p>
      <p>Or paste this link into your browser:<br/>${link}</p>
      <p>Thank you,<br/>Edler Zain</p>
    `;
    const res = await sendMailAsUser({
      userId: senderId,
      to: proposal.lead.email,
      subject: `Your proposal from Edler Zain: ${proposal.title}`,
      html,
    });
    emailed = res.ok;
    emailError = res.error;
  }
  return { ok: true as const, link, emailed, emailError };
}

export type ProposalFieldPatch = {
  title?: string;
  coverLetter?: string;
  scopeNarrative?: string;
  termsText?: string;
  estimatedDeliveryCost?: number;
  paymentScheduleType?: PaymentScheduleType;
  recurringInterval?: string;
  demoKey?: string;
  lineItems?: TemplateLineItem[];
  payments?: TemplatePayment[];
};

/**
 * Apply a partial set of proposal fields. Only provided keys are written; when
 * `lineItems`/`payments` arrays are present they REPLACE the existing rows.
 * Shared by the agent API's create-overrides and PATCH.
 */
export async function applyProposalFields(proposalId: string, patch: ProposalFieldPatch) {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.coverLetter !== undefined) data.coverLetter = patch.coverLetter;
  if (patch.scopeNarrative !== undefined) data.scopeNarrative = patch.scopeNarrative;
  if (patch.termsText !== undefined) data.termsText = patch.termsText;
  if (patch.estimatedDeliveryCost !== undefined)
    data.estimatedDeliveryCost = patch.estimatedDeliveryCost;
  if (patch.paymentScheduleType !== undefined)
    data.paymentScheduleType = patch.paymentScheduleType;
  if (patch.recurringInterval !== undefined) data.recurringInterval = patch.recurringInterval;
  if (patch.demoKey !== undefined) data.demoKey = patch.demoKey || null;
  if (Object.keys(data).length) {
    await prisma.proposal.update({ where: { id: proposalId }, data });
  }
  if (patch.lineItems) {
    await prisma.proposalLineItem.deleteMany({ where: { proposalId } });
    if (patch.lineItems.length) {
      await prisma.proposalLineItem.createMany({
        data: patch.lineItems.map((li, i) => ({
          proposalId,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          sortOrder: i,
        })),
      });
    }
  }
  if (patch.payments) {
    await prisma.proposalPayment.deleteMany({ where: { proposalId } });
    if (patch.payments.length) {
      await prisma.proposalPayment.createMany({
        data: patch.payments.map((p, i) => ({
          proposalId,
          description: p.description,
          amount: p.amount,
          dueOn: p.dueOn,
          sortOrder: i,
        })),
      });
    }
  }
}

/** A full proposal payload for the agent API (includes internal fields). */
export async function getProposalSummary(id: string) {
  const p = await prisma.proposal.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!p) return null;
  const contractTotal = p.lineItems.reduce(
    (s, li) => s + Number(li.quantity) * Number(li.unitPrice),
    0,
  );
  const scope = await getScopingView(p.id);
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    scoped: scope.computed.budgetCost > 0,
    demoKey: p.demoKey,
    scoping: {
      markupEnabled: scope.markupEnabled,
      markupPct: scope.markupPct,
      lines: scope.lines,
      ...scope.computed,
    },
    publicToken: p.publicToken,
    link: p.publicToken ? `${appBaseUrl()}/p/${p.publicToken}` : null,
    paymentStatus: p.paymentStatus,
    amountPaid: p.amountPaid != null ? Number(p.amountPaid) : null,
    estimatedDeliveryCost: Number(p.estimatedDeliveryCost),
    contractTotal,
    coverLetter: p.coverLetter,
    scopeNarrative: p.scopeNarrative,
    termsText: p.termsText,
    paymentScheduleType: p.paymentScheduleType,
    recurringInterval: p.recurringInterval,
    lead: {
      id: p.lead.id,
      name:
        p.lead.companyName ||
        [p.lead.firstName, p.lead.lastName].filter(Boolean).join(" ") ||
        "Lead",
      email: p.lead.email,
    },
    owner: p.owner ? { id: p.owner.id, name: p.owner.name, email: p.owner.email } : null,
    lineItems: p.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
    })),
    payments: p.payments.map((pp) => ({
      description: pp.description,
      amount: Number(pp.amount),
      dueOn: pp.dueOn,
    })),
  };
}
