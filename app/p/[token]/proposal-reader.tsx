"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { PaymentScheduleType } from "@prisma/client";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { BrochureContent } from "@/lib/brochure";
import type { DemoContent } from "@/lib/demos";
import { DemoArtifact } from "@/components/demo-artifact";
import { ViewRecorder } from "./view-recorder";
import { SignProposal } from "./sign-proposal";
import { PaymentConfirmer } from "./payment-confirmer";
import { PrintButton } from "./print-button";

const SCHEDULE_LABELS: Record<PaymentScheduleType, string> = {
  ONE_TIME: "One-time payment",
  DEPOSIT_THEN_BALANCE: "Deposit, then balance",
  INSTALLMENTS: "Installments",
  RECURRING: "Recurring",
};

type LineItem = { id: string; description: string; quantity: number; unitPrice: number };
type Payment = { id: string; description: string; amount: number; dueOn: string | null };

export type ReaderProposal = {
  title: string;
  coverLetter: string | null;
  scopeNarrative: string | null;
  termsText: string | null;
  paymentScheduleType: PaymentScheduleType;
  recurringInterval: string | null;
  signerName: string | null;
  signedAt: string | null;
  paymentStatus: "NONE" | "PENDING" | "PAID";
  amountPaid: number | null;
  paidAt: string | null;
  clientName: string;
  ownerName: string | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  leadEmail: string | null;
  lineItems: LineItem[];
  payments: Payment[];
};

export function ProposalReader({
  token,
  proposal,
  brochure,
  demo,
  flags,
  sessionId,
}: {
  token: string;
  proposal: ReaderProposal;
  brochure: BrochureContent;
  demo: DemoContent | null;
  flags: {
    paymentRequired: boolean;
    depositAmount: number;
    isSigned: boolean;
    isDeclined: boolean;
    isPaid: boolean;
    canceled: boolean;
  };
  sessionId?: string;
}) {
  const { isSigned, isDeclined, isPaid, paymentRequired, depositAmount, canceled } = flags;
  const canSign = !isSigned && !isDeclined;
  const confirming = Boolean(sessionId) && !isPaid;

  const contractTotal = proposal.lineItems.reduce(
    (s, li) => s + li.quantity * li.unitPrice,
    0,
  );

  const TABS = [
    "Welcome",
    "About us",
    "Our work",
    "Your engagement",
    "Payment & signature",
    "Next steps",
  ];
  const NEXT = 5;
  const PAY = 4;
  // Land the client where it makes sense: Next steps once signed, else the
  // payment tab when returning from checkout, else the start.
  const initial = isSigned ? NEXT : sessionId || canceled ? PAY : 0;
  const [active, setActive] = useState(initial);

  // When the proposal becomes signed (after the sign action refreshes the page),
  // advance to the Next steps page automatically.
  useEffect(() => {
    if (isSigned) setActive(NEXT);
  }, [isSigned]);

  const canOpen = (i: number) => (i === NEXT ? isSigned : true);
  const go = (dir: 1 | -1) => {
    let next = active + dir;
    while (next >= 0 && next < TABS.length && !canOpen(next)) next += dir;
    if (next >= 0 && next < TABS.length) setActive(next);
  };
  const atStart = active === 0;
  const lastOpen = isSigned ? NEXT : PAY;
  const atEnd = active >= lastOpen;

  return (
    <div className="min-h-screen bg-bg">
      {canSign && !sessionId && <ViewRecorder token={token} />}
      {sessionId && !isPaid && <PaymentConfirmer token={token} sessionId={sessionId} />}

      <div className="mx-auto w-full max-w-[860px] px-6 py-8">
        {/* Masthead */}
        <div className="flex items-end justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="font-heading text-[24px] font-extrabold tracking-[-0.03em]">
              Edler Zain
            </div>
            <div className="micro-label mt-1">Proposal · {proposal.clientName}</div>
          </div>
          <PrintButton />
        </div>

        {/* Tab bar */}
        <nav className="no-print mt-5 flex flex-wrap gap-2">
          {TABS.map((t, i) => {
            const open = canOpen(i);
            const done = i === NEXT && isSigned;
            return (
              <button
                key={t}
                disabled={!open}
                onClick={() => open && setActive(i)}
                className={cn(
                  "flex items-center gap-2 border-2 px-3 py-2 text-[13px] font-heading font-extrabold uppercase tracking-[0.04em]",
                  active === i
                    ? "border-ink bg-ink text-bg"
                    : open
                      ? "border-divider bg-surface text-ink hover:border-ink"
                      : "cursor-not-allowed border-divider bg-surface text-muted opacity-50",
                )}
              >
                <span className="tabular-nums">{i + 1}</span>
                {t}
                {done && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </nav>

        {/* Panels (all rendered; inactive hidden — print reveals all) */}
        <div className="reader-panels mt-6">
          <Panel show={active === 0}>
            <WelcomePanel proposal={proposal} />
          </Panel>
          <Panel show={active === 1}>
            <BrochurePanel brochure={brochure} />
          </Panel>
          <Panel show={active === 2}>
            {demo ? (
              <DemoArtifact demo={demo} />
            ) : (
              <div className="text-muted">A sample of our work will appear here.</div>
            )}
          </Panel>
          <Panel show={active === 3}>
            <ServicesPanel proposal={proposal} contractTotal={contractTotal} />
          </Panel>
          <Panel show={active === PAY}>
            <PaymentPanel
              token={token}
              proposal={proposal}
              contractTotal={contractTotal}
              flags={flags}
              confirming={confirming}
              canceled={canceled}
              canSign={canSign}
              paymentRequired={paymentRequired}
              depositAmount={depositAmount}
              onSigned={() => setActive(NEXT)}
            />
          </Panel>
          <Panel show={active === NEXT}>
            <NextStepsPanel proposal={proposal} isPaid={isPaid} />
          </Panel>
        </div>

        {/* Arrows */}
        <div className="no-print mt-8 flex items-center justify-between border-t-2 border-divider pt-4">
          <button
            className="btn btn-secondary"
            onClick={() => go(-1)}
            disabled={atStart}
            style={{ opacity: atStart ? 0.4 : 1 }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="micro-label">
            {active + 1} / {TABS.length}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => go(1)}
            disabled={atEnd}
            style={{ opacity: atEnd ? 0.4 : 1 }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-8 border-t-2 border-divider pt-4 text-[12px] text-muted">
          Edler Zain · This proposal was delivered electronically via LAPS.
        </div>
      </div>
    </div>
  );
}

function Panel({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <section className={cn("reader-panel", show ? "block" : "hidden")}>{children}</section>;
}

function WelcomePanel({ proposal }: { proposal: ReaderProposal }) {
  return (
    <div>
      <div className="micro-label">Prepared for {proposal.clientName}</div>
      <h1 className="mt-3 text-[38px]">{proposal.title}</h1>
      {proposal.ownerName && (
        <div className="mt-2 text-muted">Prepared by {proposal.ownerName}, Edler Zain</div>
      )}
      {proposal.coverLetter ? (
        <p className="mt-8 whitespace-pre-wrap text-[16px] leading-relaxed">
          {proposal.coverLetter}
        </p>
      ) : (
        <p className="mt-8 text-[16px] leading-relaxed text-muted">
          Thank you for the opportunity. Use “Next” to review who we are, your engagement, and to
          accept and get started.
        </p>
      )}
    </div>
  );
}

function BrochurePanel({ brochure }: { brochure: BrochureContent }) {
  return (
    <div>
      {brochure.isPlaceholder && (
        <div className="no-print mb-6 border-2 border-accent bg-surface px-4 py-3 text-[13px]">
          <span className="micro-label text-accent">Sample content</span> — these stats, case
          studies, and testimonials are examples. Replace them before sending to clients.
        </div>
      )}
      <div className="micro-label">About Edler Zain</div>
      <h2 className="mt-2 text-[30px]">{brochure.headline}</h2>
      <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted">{brochure.intro}</p>

      {/* Stats */}
      {brochure.stats.length > 0 && (
        <div className="mt-8 grid grid-cols-2 border-2 border-ink md:grid-cols-4">
          {brochure.stats.map((s, i) => (
            <div
              key={i}
              className={cn(
                "px-4 py-5",
                i % 2 === 1 && "border-l-2 border-divider",
                "md:border-l-2 md:border-divider",
                i % 4 === 0 && "md:border-l-0",
                i < 2 && "border-b-2 border-divider md:border-b-0",
              )}
            >
              <div className="font-heading text-[30px] font-extrabold [font-variant-numeric:tabular-nums]">
                {s.value}
              </div>
              <div className="micro-label mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Case studies per service line */}
      {brochure.caseStudies.length > 0 && (
        <div className="mt-10">
          <div className="micro-label">Case studies</div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {brochure.caseStudies.map((c, i) => (
              <div key={i} className="border border-divider bg-surface p-4">
                <div className="micro-label text-accent">{c.service}</div>
                <div className="mt-2 font-heading text-[17px] font-extrabold">{c.title}</div>
                <div className="mt-1 font-heading text-[22px] font-extrabold">{c.result}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Testimonials */}
      {brochure.testimonials.length > 0 && (
        <div className="mt-10">
          <div className="micro-label">What clients say</div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {brochure.testimonials.map((t, i) => (
              <blockquote key={i} className="border-l-2 border-accent bg-surface p-4">
                <p className="text-[15px] leading-relaxed">“{t.quote}”</p>
                <footer className="mt-3 text-[13px] text-muted">
                  <strong className="text-ink">{t.author}</strong> · {t.role}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {/* LinkedIn thought leadership */}
      {brochure.linkedinPosts.length > 0 && (
        <div className="mt-10">
          <div className="micro-label">From our team on LinkedIn</div>
          <div className="mt-3 space-y-3">
            {brochure.linkedinPosts.map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="block border border-divider p-4 hover:border-ink"
              >
                <p className="text-[14px] leading-relaxed">{p.excerpt}</p>
                <div className="micro-label mt-2 text-accent">Read on LinkedIn →</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicesPanel({
  proposal,
  contractTotal,
}: {
  proposal: ReaderProposal;
  contractTotal: number;
}) {
  return (
    <div>
      <div className="micro-label">Your engagement</div>
      <h2 className="mt-2 text-[30px]">What&apos;s included</h2>
      {proposal.scopeNarrative && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">
          {proposal.scopeNarrative}
        </p>
      )}

      <div className="mt-8 micro-label">Investment</div>
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
              <td className="num">{li.quantity}</td>
              <td className="num">{formatCurrency(li.unitPrice)}</td>
              <td className="num">{formatCurrency(li.quantity * li.unitPrice)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="num font-heading font-extrabold">
              Total
            </td>
            <td className="num font-heading font-extrabold">{formatCurrency(contractTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PaymentPanel({
  token,
  proposal,
  contractTotal,
  flags,
  confirming,
  canceled,
  canSign,
  paymentRequired,
  depositAmount,
  onSigned,
}: {
  token: string;
  proposal: ReaderProposal;
  contractTotal: number;
  flags: { isSigned: boolean; isDeclined: boolean; isPaid: boolean };
  confirming: boolean;
  canceled: boolean;
  canSign: boolean;
  paymentRequired: boolean;
  depositAmount: number;
  onSigned: () => void;
}) {
  return (
    <div>
      <div className="micro-label">Payment &amp; signature</div>
      <h2 className="mt-2 text-[30px]">Accept your proposal</h2>

      {/* Payment schedule */}
      <div className="mt-6 micro-label">Payment schedule</div>
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
                <td className="num">{formatCurrency(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-2 text-[15px] text-muted">
          {formatCurrency(contractTotal)} due on acceptance.
        </div>
      )}

      {/* Terms */}
      {proposal.termsText && (
        <div className="mt-8">
          <div className="micro-label">Terms</div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
            {proposal.termsText}
          </p>
        </div>
      )}

      {/* Signature / status */}
      <div className="mt-8">
        {confirming && (
          <div className="no-print border-2 border-divider bg-surface px-5 py-4">
            <div className="micro-label">Confirming payment…</div>
            <div className="mt-1 text-[15px] text-muted">
              We&apos;re confirming your deposit — this only takes a moment.
            </div>
          </div>
        )}
        {flags.isSigned && (
          <div className="border-2 border-accent bg-accent px-5 py-4 text-bg">
            <div className="micro-label text-bg/80">Signed</div>
            <div className="mt-1 text-[15px]">
              Accepted{proposal.signerName ? ` by ${proposal.signerName}` : ""}
              {proposal.signedAt ? ` on ${formatDate(proposal.signedAt)}` : ""}.
              {flags.isPaid
                ? ` Deposit of ${formatCurrency(proposal.amountPaid ?? 0)} paid.`
                : ""}{" "}
              See “Next steps” for what happens now.
            </div>
          </div>
        )}
        {flags.isDeclined && (
          <div className="border-2 border-divider bg-surface px-5 py-4">
            <div className="micro-label">Declined</div>
            <div className="mt-1 text-[15px] text-muted">
              This proposal has been marked declined. If this was a mistake, please contact us.
            </div>
          </div>
        )}
        {canSign && canceled && !confirming && (
          <div className="no-print mb-4 border-2 border-divider bg-surface px-5 py-4">
            <div className="micro-label">Payment canceled</div>
            <div className="mt-1 text-[15px] text-muted">
              No payment was taken. You can sign again below whenever you&apos;re ready.
            </div>
          </div>
        )}
        {canSign && !confirming && (
          <SignProposal
            token={token}
            defaultName={[proposal.leadFirstName, proposal.leadLastName]
              .filter(Boolean)
              .join(" ")}
            defaultEmail={proposal.leadEmail ?? ""}
            depositAmount={depositAmount}
            paymentRequired={paymentRequired}
            onSigned={onSigned}
          />
        )}
      </div>
    </div>
  );
}

function NextStepsPanel({
  proposal,
  isPaid,
}: {
  proposal: ReaderProposal;
  isPaid: boolean;
}) {
  const steps = [
    {
      title: "A welcome from our team",
      body: "You'll receive a warm welcome and a single point of contact within one business day.",
    },
    {
      title: "Onboarding kickoff call",
      body: "We'll schedule a short kickoff to align on goals, timelines, and access.",
    },
    {
      title: "Document & information requests",
      body: "We'll send a simple checklist of what we need to hit the ground running.",
    },
    {
      title: "We get to work",
      body: "Your engagement begins — with clear communication and no surprises.",
    },
  ];
  return (
    <div>
      <div className="micro-label text-accent">You&apos;re all set</div>
      <h2 className="mt-2 text-[30px]">Welcome aboard, {proposal.clientName}</h2>
      <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted">
        Thank you for signing{proposal.signerName ? `, ${proposal.signerName}` : ""}.
        {isPaid ? " Your deposit is received." : ""} Here&apos;s what happens next.
      </p>

      <ol className="mt-8 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[40px_1fr] gap-3 border-t-2 border-divider pt-4">
            <div className="font-heading text-[24px] font-extrabold text-accent [font-variant-numeric:tabular-nums]">
              {i + 1}
            </div>
            <div>
              <div className="font-heading text-[17px] font-extrabold">{s.title}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-2 border-ink bg-surface p-5">
        <div className="micro-label">Questions in the meantime?</div>
        <p className="mt-1 text-[15px]">
          Reply to your proposal email or reach out to your Edler Zain contact
          {proposal.ownerName ? `, ${proposal.ownerName}` : ""}. We&apos;re glad to have you.
        </p>
      </div>
    </div>
  );
}
