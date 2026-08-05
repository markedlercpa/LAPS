import type { PaymentScheduleType, SnippetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Starter proposal templates for Edler Zain's core engagements. These are the
 * seed set — agents (and humans) can add more via the DB / agent API. Numbers
 * are sensible defaults meant to be adjusted per deal, not fixed pricing.
 *
 * Seeded lazily (see ensureProposalTemplatesSeeded) so it works in every
 * environment without a build-time step. Upsert is keyed on `key`, so editing
 * copy here and re-deploying refreshes the stored template.
 */

export type TemplateLineItem = { description: string; quantity: number; unitPrice: number };
export type TemplatePayment = { description: string; amount: number; dueOn?: string };

export type ProposalTemplateSeed = {
  key: string;
  name: string;
  description: string;
  defaultTitle: string;
  coverLetter: string;
  scopeNarrative: string;
  termsText: string;
  paymentScheduleType: PaymentScheduleType;
  recurringInterval?: string;
  defaultDeliveryCost?: number;
  lineItems: TemplateLineItem[];
  payments: TemplatePayment[];
  sortOrder: number;
};

export const PROPOSAL_TEMPLATES: ProposalTemplateSeed[] = [
  {
    key: "cas-monthly",
    name: "Client Accounting Services (CAS)",
    description: "Recurring monthly bookkeeping / controller services.",
    defaultTitle: "Client Accounting Services Engagement",
    coverLetter:
      "Thank you for the opportunity to support your finance function. This proposal outlines an ongoing Client Accounting Services partnership in which our team owns your day-to-day accounting so you can focus on running the business. We become your outsourced accounting department — accurate books, on-time closes, and clear monthly reporting you can actually use.",
    scopeNarrative:
      "Monthly scope includes: transaction categorization and bookkeeping; bank, credit card, and balance-sheet reconciliations; accounts payable and accounts receivable management; payroll journal entries; a monthly close with financial statements (P&L, balance sheet, cash flow); and a monthly review call to walk through results and answer questions. We maintain your chart of accounts and provide a clean, audit-ready ledger throughout the year.",
    termsText:
      "This is a month-to-month engagement billed monthly in advance; either party may cancel with 30 days' written notice. Fees assume the transaction volume and entity structure discussed; material changes may adjust the monthly fee with prior agreement. Client is responsible for timely delivery of statements, receipts, and access to source systems.",
    paymentScheduleType: "RECURRING",
    recurringInterval: "Monthly",
    defaultDeliveryCost: 1200,
    lineItems: [{ description: "Monthly client accounting services", quantity: 1, unitPrice: 2500 }],
    payments: [{ description: "First month due on signing", amount: 2500, dueOn: "On signing" }],
    sortOrder: 0,
  },
  {
    key: "tax-prep-planning",
    name: "Tax Preparation & Planning",
    description: "Annual return preparation plus a year-end planning session.",
    defaultTitle: "Tax Preparation & Planning Engagement",
    coverLetter:
      "Thank you for considering Edler Zain for your tax needs. This engagement covers preparation and filing of your business and personal returns, plus a proactive planning session so there are no surprises at year end. Our goal is an accurate, on-time filing and a clear strategy to legally minimize what you owe.",
    scopeNarrative:
      "Scope includes: preparation of federal and applicable state income tax returns for the business and owners; a year-end tax planning session to review estimated liability and planning opportunities; e-filing and delivery of final returns; and reasonable support for questions arising from the filed returns. Bookkeeping cleanup, audit representation, and prior-year amendments are out of scope unless separately engaged.",
    termsText:
      "Fees are due per the schedule below. Returns are prepared from information provided by the client; we rely on that information without audit. Filing deadlines assume complete information is received at least three weeks before the applicable due date. Extensions may be filed as needed; taxes owed remain due by the statutory deadline.",
    paymentScheduleType: "DEPOSIT_THEN_BALANCE",
    defaultDeliveryCost: 1800,
    lineItems: [
      { description: "Business & personal return preparation", quantity: 1, unitPrice: 3500 },
      { description: "Year-end tax planning session", quantity: 1, unitPrice: 1000 },
    ],
    payments: [
      { description: "Deposit on signing", amount: 2250, dueOn: "On signing" },
      { description: "Balance on delivery of returns", amount: 2250, dueOn: "On delivery" },
    ],
    sortOrder: 1,
  },
  {
    key: "quality-of-earnings",
    name: "Quality of Earnings (QoE)",
    description: "Buy-side / sell-side QoE analysis and databook.",
    defaultTitle: "Quality of Earnings Engagement",
    coverLetter:
      "Thank you for engaging Edler Zain on this transaction. This proposal covers a Quality of Earnings analysis designed to give you and your stakeholders confidence in the target's true, normalized earnings. We surface the adjustments, risks, and working-capital dynamics that matter before you commit capital.",
    scopeNarrative:
      "Scope includes: analysis of the trailing financials and general ledger; identification and quantification of non-recurring, non-operating, and normalization adjustments; a normalized EBITDA bridge; revenue and customer/vendor concentration analysis; net working-capital trend and peg analysis; and a written databook with supporting schedules. A management Q&A call is included. Legal, tax structuring, and formal valuation opinions are out of scope.",
    termsText:
      "This is a fixed-fee engagement billed per the schedule below. The analysis relies on data and representations provided by the target and its advisors and does not constitute an audit or attestation. Timeline assumes timely data-room access; scope changes (additional entities, periods, or carve-outs) may adjust the fee with prior agreement.",
    paymentScheduleType: "DEPOSIT_THEN_BALANCE",
    defaultDeliveryCost: 12000,
    lineItems: [{ description: "Quality of Earnings analysis & databook", quantity: 1, unitPrice: 25000 }],
    payments: [
      { description: "50% deposit on signing", amount: 12500, dueOn: "On signing" },
      { description: "50% on delivery of draft report", amount: 12500, dueOn: "On delivery of draft report" },
    ],
    sortOrder: 2,
  },
  {
    key: "fractional-cfo",
    name: "Fractional CFO / Advisory",
    description: "Ongoing fractional CFO retainer.",
    defaultTitle: "Fractional CFO / Advisory Engagement",
    coverLetter:
      "Thank you for the opportunity to serve as your finance partner. This proposal outlines an ongoing fractional CFO engagement — senior financial leadership without the cost of a full-time hire. We help you see around corners with forecasting, KPI visibility, and a steady hand on cash and strategy.",
    scopeNarrative:
      "Monthly scope includes: a rolling cash-flow forecast and runway monitoring; a KPI and management-reporting package with commentary; budget vs. actual analysis; support for fundraising, lending, or board preparation; and a recurring strategy call with leadership. We coordinate with your bookkeeping team (in-house or our CAS team) to ensure the numbers behind the strategy are reliable.",
    termsText:
      "This is a month-to-month retainer billed monthly in advance; either party may cancel with 30 days' written notice. The retainer covers the agreed scope and cadence; special projects (transactions, system implementations, audits) are scoped separately. Client provides timely access to financial systems and leadership availability for the recurring cadence.",
    paymentScheduleType: "RECURRING",
    recurringInterval: "Monthly",
    defaultDeliveryCost: 3000,
    lineItems: [{ description: "Fractional CFO retainer (monthly)", quantity: 1, unitPrice: 6000 }],
    payments: [{ description: "First month due on signing", amount: 6000, dueOn: "On signing" }],
    sortOrder: 3,
  },
];

/** Section snippets are derived from each template's sections. */
const SNIPPET_SECTIONS: { type: SnippetType; field: "coverLetter" | "scopeNarrative" | "termsText"; label: string }[] = [
  { type: "COVER", field: "coverLetter", label: "Cover" },
  { type: "SCOPE", field: "scopeNarrative", label: "Scope" },
  { type: "TERMS", field: "termsText", label: "Terms" },
];

export function sectionSnippetSeeds() {
  const out: { key: string; type: SnippetType; name: string; body: string; sortOrder: number }[] = [];
  PROPOSAL_TEMPLATES.forEach((t, ti) => {
    SNIPPET_SECTIONS.forEach((s, si) => {
      out.push({
        key: `${t.key}-${s.type.toLowerCase()}`,
        type: s.type,
        name: `${t.name} — ${s.label}`,
        body: t[s.field],
        sortOrder: ti * 10 + si,
      });
    });
  });
  return out;
}

let seeded = false;

/**
 * Idempotently ensure the starter templates + section snippets exist. Cheap:
 * skips work once the counts match. Call from read paths (builder page, agent
 * templates endpoint). Upserts on `key` so edits to the copy above propagate.
 */
export async function ensureProposalTemplatesSeeded() {
  if (seeded) return;
  const snippets = sectionSnippetSeeds();
  const [templateCount, snippetCount] = await Promise.all([
    prisma.proposalTemplate.count(),
    prisma.sectionSnippet.count(),
  ]);
  if (templateCount >= PROPOSAL_TEMPLATES.length && snippetCount >= snippets.length) {
    seeded = true;
    return;
  }

  for (const t of PROPOSAL_TEMPLATES) {
    await prisma.proposalTemplate.upsert({
      where: { key: t.key },
      update: {
        name: t.name,
        description: t.description,
        defaultTitle: t.defaultTitle,
        coverLetter: t.coverLetter,
        scopeNarrative: t.scopeNarrative,
        termsText: t.termsText,
        paymentScheduleType: t.paymentScheduleType,
        recurringInterval: t.recurringInterval ?? null,
        defaultDeliveryCost: t.defaultDeliveryCost ?? null,
        lineItems: t.lineItems,
        payments: t.payments,
        sortOrder: t.sortOrder,
      },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        defaultTitle: t.defaultTitle,
        coverLetter: t.coverLetter,
        scopeNarrative: t.scopeNarrative,
        termsText: t.termsText,
        paymentScheduleType: t.paymentScheduleType,
        recurringInterval: t.recurringInterval ?? null,
        defaultDeliveryCost: t.defaultDeliveryCost ?? null,
        lineItems: t.lineItems,
        payments: t.payments,
        sortOrder: t.sortOrder,
      },
    });
  }
  for (const s of snippets) {
    await prisma.sectionSnippet.upsert({
      where: { key: s.key },
      update: { type: s.type, name: s.name, body: s.body, sortOrder: s.sortOrder },
      create: s,
    });
  }
  seeded = true;
}
