import { notFound } from "next/navigation";
import type { PaymentScheduleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ViewRecorder } from "./view-recorder";
import { SignProposal } from "./sign-proposal";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const SCHEDULE_LABELS: Record<PaymentScheduleType, string> = {
  ONE_TIME: "One-time payment",
  DEPOSIT_THEN_BALANCE: "Deposit, then balance",
  INSTALLMENTS: "Installments",
  RECURRING: "Recurring",
};

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

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
      lostReason: true,
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

  const contractTotal = proposal.lineItems.reduce(
    (sum, li) => sum + Number(li.quantity) * Number(li.unitPrice),
    0,
  );
  const clientName =
    proposal.lead.companyName ||
    [proposal.lead.firstName, proposal.lead.lastName].filter(Boolean).join(" ") ||
    "Client";
  const isSigned = proposal.status === "WON";
  const isDeclined = proposal.status === "LOST";
  const canSign = !isSigned && !isDeclined;

  return (
    <div className="min-h-screen bg-bg">
      {canSign && <ViewRecorder token={token} />}

      <div className="mx-auto w-full max-w-[820px] px-6 py-10">
        {/* Masthead */}
        <div className="flex items-end justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="font-heading text-[26px] font-extrabold tracking-[-0.03em]">
              Edler Zain
            </div>
            <div className="micro-label mt-1">Proposal</div>
          </div>
          <PrintButton />
        </div>

        {/* Status banners */}
        {isSigned && (
          <div className="mt-6 border-2 border-accent bg-accent px-5 py-4 text-bg">
            <div className="micro-label text-bg/80">Signed</div>
            <div className="mt-1 text-[15px]">
              Accepted{proposal.signerName ? ` by ${proposal.signerName}` : ""}
              {proposal.signedAt ? ` on ${formatDate(proposal.signedAt)}` : ""}. Thank you — a
              copy has been recorded and our team will be in touch to begin onboarding.
            </div>
          </div>
        )}
        {isDeclined && (
          <div className="mt-6 border-2 border-divider bg-surface px-5 py-4">
            <div className="micro-label">Declined</div>
            <div className="mt-1 text-[15px] text-muted">
              This proposal has been marked declined. If this was a mistake, please contact us.
            </div>
          </div>
        )}

        {/* Title block */}
        <div className="mt-8">
          <h1 className="text-[34px]">{proposal.title}</h1>
          <div className="mt-2 text-muted">
            Prepared for <strong>{clientName}</strong>
            {proposal.owner?.name ? ` · by ${proposal.owner.name}` : ""}
          </div>
        </div>

        {/* Cover letter */}
        {proposal.coverLetter && (
          <section className="mt-8">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {proposal.coverLetter}
            </p>
          </section>
        )}

        {/* Scope narrative */}
        {proposal.scopeNarrative && (
          <section className="mt-8">
            <div className="micro-label">Scope of work</div>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
              {proposal.scopeNarrative}
            </p>
          </section>
        )}

        {/* Line items */}
        <section className="mt-8">
          <div className="micro-label">Investment</div>
          <table className="table mt-2 w-full">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {proposal.lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.description}</td>
                  <td className="num">{Number(li.quantity)}</td>
                  <td className="num">{formatCurrency(Number(li.unitPrice))}</td>
                  <td className="num">
                    {formatCurrency(Number(li.quantity) * Number(li.unitPrice))}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="num font-heading font-extrabold">
                  Total
                </td>
                <td className="num font-heading font-extrabold">
                  {formatCurrency(contractTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Payment schedule */}
        <section className="mt-8">
          <div className="micro-label">Payment schedule</div>
          <div className="mt-2 text-[15px]">
            {SCHEDULE_LABELS[proposal.paymentScheduleType]}
            {proposal.recurringInterval ? ` · ${proposal.recurringInterval}` : ""}
          </div>
          {proposal.payments.length > 0 ? (
            <table className="table mt-2 w-full">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {proposal.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.description}</td>
                    <td>{p.dueOn || "—"}</td>
                    <td className="num">{formatCurrency(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-2 text-[15px] text-muted">
              {formatCurrency(contractTotal)} due on acceptance.
            </div>
          )}
        </section>

        {/* Terms */}
        {proposal.termsText && (
          <section className="mt-8">
            <div className="micro-label">Terms</div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
              {proposal.termsText}
            </p>
          </section>
        )}

        {/* Sign */}
        {canSign && (
          <section className="mt-10">
            <SignProposal
              token={token}
              defaultName={[proposal.lead.firstName, proposal.lead.lastName]
                .filter(Boolean)
                .join(" ")}
              defaultEmail={proposal.lead.email ?? ""}
            />
          </section>
        )}

        <div className="mt-10 border-t-2 border-divider pt-4 text-[12px] text-muted">
          Edler Zain · This proposal was delivered electronically via LAPS.
        </div>
      </div>
    </div>
  );
}
