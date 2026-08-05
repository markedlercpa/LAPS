import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { stripeConfigured } from "@/lib/stripe";
import { getBrochure } from "@/lib/brochure";
import { getDemo } from "@/lib/demos";
import { ProposalReader } from "./proposal-reader";

export const dynamic = "force-dynamic";

export default async function PublicProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; canceled?: string }>;
}) {
  const { token } = await params;
  const { session_id: sessionId, canceled } = await searchParams;

  // Select ONLY client-safe fields — never estimatedDeliveryCost / margin.
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      coverLetter: true,
      scopeNarrative: true,
      termsText: true,
      paymentScheduleType: true,
      recurringInterval: true,
      signerName: true,
      signedAt: true,
      paymentStatus: true,
      amountPaid: true,
      paidAt: true,
      demoKeys: true,
      lead: { select: { firstName: true, lastName: true, companyName: true, email: true } },
      owner: { select: { name: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, description: true, quantity: true, unitPrice: true },
      },
      payments: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, description: true, amount: true, dueOn: true },
      },
    },
  });

  if (!proposal) notFound();

  const brochure = await getBrochure();
  const demos = (await Promise.all(proposal.demoKeys.map((k) => getDemo(k)))).filter(
    (d): d is NonNullable<typeof d> => d !== null,
  );

  const clientName =
    proposal.lead.companyName ||
    [proposal.lead.firstName, proposal.lead.lastName].filter(Boolean).join(" ") ||
    "Client";
  const depositAmount = Number(proposal.payments[0]?.amount ?? 0);

  return (
    <ProposalReader
      token={token}
      sessionId={sessionId}
      brochure={brochure}
      demos={demos}
      flags={{
        paymentRequired: stripeConfigured() && depositAmount > 0,
        depositAmount,
        isSigned: proposal.status === "WON",
        isDeclined: proposal.status === "LOST",
        isPaid: proposal.paymentStatus === "PAID",
        canceled: Boolean(canceled),
      }}
      proposal={{
        title: proposal.title,
        coverLetter: proposal.coverLetter,
        scopeNarrative: proposal.scopeNarrative,
        termsText: proposal.termsText,
        paymentScheduleType: proposal.paymentScheduleType,
        recurringInterval: proposal.recurringInterval,
        signerName: proposal.signerName,
        signedAt: proposal.signedAt?.toISOString() ?? null,
        paymentStatus: proposal.paymentStatus,
        amountPaid: proposal.amountPaid != null ? Number(proposal.amountPaid) : null,
        paidAt: proposal.paidAt?.toISOString() ?? null,
        clientName,
        ownerName: proposal.owner?.name ?? null,
        leadFirstName: proposal.lead.firstName,
        leadLastName: proposal.lead.lastName,
        leadEmail: proposal.lead.email,
        lineItems: proposal.lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
        })),
        payments: proposal.payments.map((p) => ({
          id: p.id,
          description: p.description,
          amount: Number(p.amount),
          dueOn: p.dueOn,
        })),
      }}
    />
  );
}
