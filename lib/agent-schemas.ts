import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0).default(0),
});

export const paymentSchema = z.object({
  description: z.string().min(1),
  amount: z.number().min(0).default(0),
  dueOn: z.string().optional(),
});

export const scopeLineSchema = z.object({
  level: z.enum(["ASSOCIATE", "SENIOR", "MANAGER", "DIRECTOR", "PARTNER"]),
  hours: z.number().min(0),
  costRate: z.number().min(0).optional(),
  billRate: z.number().min(0).optional(),
});

/** Fields an agent can set on a proposal (shared by create + patch). */
export const proposalFieldsSchema = z.object({
  title: z.string().min(1).optional(),
  coverLetter: z.string().optional(),
  scopeNarrative: z.string().optional(),
  termsText: z.string().optional(),
  estimatedDeliveryCost: z.number().min(0).optional(),
  paymentScheduleType: z
    .enum(["ONE_TIME", "DEPOSIT_THEN_BALANCE", "INSTALLMENTS", "RECURRING"])
    .optional(),
  recurringInterval: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  payments: z.array(paymentSchema).optional(),
  // Scoping engine: hours per level (drives price + margin) + sales markup.
  scoping: z.array(scopeLineSchema).optional(),
  salesMarkupEnabled: z.boolean().optional(),
  salesMarkupPct: z.number().min(0).optional(),
  // Sample deliverables (demos) shown to the client — at least one required to send.
  demoKeys: z.array(z.string()).optional(),
});

export const createProposalSchema = proposalFieldsSchema.extend({
  leadId: z.string().optional(),
  leadEmail: z.string().email().optional(),
  templateKey: z.string().optional(),
});

export const patchProposalSchema = proposalFieldsSchema.extend({
  templateKey: z.string().optional(),
});
