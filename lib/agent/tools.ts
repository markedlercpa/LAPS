import type Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Stage, ActivityType, Direction } from "@prisma/client";
import { createBooking } from "@/lib/booking";
import { sendMailAsUser, graphConfigured, deleteCalendarEvent } from "@/lib/graph";

/**
 * LAPS-native tools for the embedded chat agent. Reads run inline in the agent
 * loop; writes are gated — the loop stops and the human confirms before `run`
 * is ever called (see lib/agent/run.ts). Every write reuses the same server
 * logic the UI uses, and always derives the actor from `ctx` (the signed-in
 * rep) rather than trusting anything the model supplies.
 */

export type AgentContext = {
  userId: string;
  role?: string;
  name?: string | null;
  email?: string | null;
};

export type ToolResult = { ok: boolean; [k: string]: unknown };

export type AgentTool = {
  name: string;
  description: string;
  mode: "read" | "write";
  input_schema: Anthropic.Tool.InputSchema;
  /** Human-readable one-liner shown on the confirmation card (writes only). */
  confirmSummary?: (input: Record<string, unknown>) => string;
  run: (input: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
};

const STAGES: Stage[] = ["NEW", "APPOINTMENT", "PROPOSAL", "CLOSED_WON", "CLOSED_LOST"];

/**
 * Best-effort cache revalidation. `revalidatePath` throws outside a Next
 * request store (e.g. the MCP route's tool-execution context, or a script), and
 * refreshing a page cache must never fail a data write — so swallow that error.
 */
function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    /* no request store — the write already succeeded */
  }
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function leadName(l: { firstName: string; lastName: string; companyName: string | null }): string {
  const person = `${l.firstName} ${l.lastName}`.trim();
  return l.companyName ? `${person} · ${l.companyName}` : person;
}

// ── Read tools ──────────────────────────────────────────────────────────────

const listLeads: AgentTool = {
  name: "list_leads",
  description:
    "List/search leads in the LAPS pipeline. Optionally filter by stage, a free-text search over name/company/email, or restrict to leads owned by the current user. Returns compact rows.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: {
      stage: { type: "string", enum: STAGES, description: "Pipeline stage filter." },
      search: { type: "string", description: "Case-insensitive match on first/last name, company, or email." },
      mine: { type: "boolean", description: "If true, only leads owned by the current user." },
      limit: { type: "integer", description: "Max rows (default 25, max 100)." },
    },
  },
  run: async (input, ctx) => {
    const limit = Math.min(Number(input.limit) || 25, 100);
    const search = str(input, "search");
    const where: Record<string, unknown> = {};
    if (typeof input.stage === "string" && STAGES.includes(input.stage as Stage)) where.stage = input.stage;
    if (input.mine === true) where.ownerId = ctx.userId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true, firstName: true, lastName: true, companyName: true,
        email: true, stage: true, trustScore: true,
      },
    });
    return {
      ok: true,
      count: leads.length,
      leads: leads.map((l) => ({
        id: l.id, name: leadName(l), email: l.email,
        stage: l.stage, trustScore: l.trustScore,
      })),
    };
  },
};

const getLead: AgentTool = {
  name: "get_lead",
  description:
    "Get one lead by id with recent timeline activities, upcoming/recent appointments, open tasks, and trust score. Use after list_leads to inspect a specific lead.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { id: { type: "string", description: "Lead id." } },
    required: ["id"],
  },
  run: async (input) => {
    const id = str(input, "id");
    if (!id) return { ok: false, error: "Missing lead id." };
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        activities: { orderBy: { occurredAt: "desc" }, take: 10 },
        appointments: { orderBy: { scheduledAt: "desc" }, take: 5 },
        actionItems: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 10 },
        owner: { select: { name: true, email: true } },
      },
    });
    if (!lead) return { ok: false, error: "Lead not found." };
    return {
      ok: true,
      lead: {
        id: lead.id,
        name: leadName(lead),
        email: lead.email,
        phone: lead.phone,
        stage: lead.stage,
        trustScore: lead.trustScore,
        leadSource: lead.leadSource,
        notes: lead.notes,
        owner: lead.owner?.name ?? lead.owner?.email ?? null,
        activities: lead.activities.map((a) => ({
          type: a.type, direction: a.direction, subject: a.subject,
          body: a.body?.slice(0, 400) ?? null, when: a.occurredAt,
        })),
        appointments: lead.appointments.map((ap) => ({
          id: ap.id, title: ap.title, when: ap.scheduledAt, status: ap.status,
        })),
        openTasks: lead.actionItems.map((t) => ({
          id: t.id, description: t.description, dueDate: t.dueDate,
        })),
      },
    };
  },
};

const listAppointments: AgentTool = {
  name: "list_appointments",
  description:
    "List appointments for the current user, either upcoming or past. Returns id, title, when, invitee, status, and leadId.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: {
      when: { type: "string", enum: ["upcoming", "past"], description: "Default upcoming." },
      mine: { type: "boolean", description: "If true (default), only the current user's appointments." },
      limit: { type: "integer", description: "Max rows (default 20, max 100)." },
    },
  },
  run: async (input, ctx) => {
    const limit = Math.min(Number(input.limit) || 20, 100);
    const past = input.when === "past";
    const now = new Date();
    const where: Record<string, unknown> = {
      scheduledAt: past ? { lt: now } : { gte: now },
    };
    if (input.mine !== false) where.ownerId = ctx.userId;
    const appts = await prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: past ? "desc" : "asc" },
      take: limit,
      select: {
        id: true, title: true, scheduledAt: true, durationMin: true,
        status: true, inviteeName: true, inviteeEmail: true, leadId: true,
      },
    });
    return {
      ok: true,
      count: appts.length,
      appointments: appts.map((a) => ({
        id: a.id, title: a.title, when: a.scheduledAt, durationMin: a.durationMin,
        status: a.status, invitee: a.inviteeName ?? a.inviteeEmail ?? null, leadId: a.leadId,
      })),
    };
  },
};

const listProposals: AgentTool = {
  name: "list_proposals",
  description:
    "List proposals, optionally filtered by status or lead. Returns id, title, status, and leadId. Never returns pricing margin.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["DRAFT", "SENT", "VIEWED", "SIGNED", "WON", "LOST"],
        description: "Proposal status filter.",
      },
      leadId: { type: "string", description: "Restrict to one lead." },
      limit: { type: "integer", description: "Max rows (default 25, max 100)." },
    },
  },
  run: async (input) => {
    const limit = Math.min(Number(input.limit) || 25, 100);
    const where: Record<string, unknown> = {};
    if (typeof input.status === "string") where.status = input.status;
    const leadId = str(input, "leadId");
    if (leadId) where.leadId = leadId;
    const proposals = await prisma.proposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, title: true, status: true, leadId: true,
        createdAt: true, sentAt: true, signedAt: true,
        lead: { select: { firstName: true, lastName: true, companyName: true } },
      },
    });
    return {
      ok: true,
      count: proposals.length,
      proposals: proposals.map((p) => ({
        id: p.id, title: p.title, status: p.status, leadId: p.leadId,
        lead: leadName(p.lead), createdAt: p.createdAt,
      })),
    };
  },
};

const listTasks: AgentTool = {
  name: "list_tasks",
  description:
    "List open tasks (action items) assigned to the current user, soonest due first. Tasks may be tied to a lead or an appointment.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { limit: { type: "integer", description: "Max rows (default 25, max 100)." } },
  },
  run: async (input, ctx) => {
    const limit = Math.min(Number(input.limit) || 25, 100);
    const tasks = await prisma.actionItem.findMany({
      where: { assigneeId: ctx.userId, status: "OPEN" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true, description: true, dueDate: true,
        lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });
    return {
      ok: true,
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id, description: t.description, dueDate: t.dueDate,
        lead: t.lead ? leadName(t.lead) : null, leadId: t.lead?.id ?? null,
      })),
    };
  },
};

const pipelineSummary: AgentTool = {
  name: "pipeline_summary",
  description:
    "Summarize the pipeline: lead counts grouped by stage, optionally restricted to the current user's leads.",
  mode: "read",
  input_schema: {
    type: "object",
    properties: { mine: { type: "boolean", description: "If true, only the current user's leads." } },
  },
  run: async (input, ctx) => {
    const where = input.mine === true ? { ownerId: ctx.userId } : {};
    const grouped = await prisma.lead.groupBy({
      by: ["stage"],
      where,
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s] = 0;
    for (const g of grouped) counts[g.stage] = g._count._all;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { ok: true, total, byStage: counts };
  },
};

// ── Write tools (confirm before run) ────────────────────────────────────────

const createLeadTool: AgentTool = {
  name: "create_lead",
  description:
    "Create a new lead in the pipeline. Requires first and last name; company, email, phone, source, and notes are optional.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      firstName: { type: "string" },
      lastName: { type: "string" },
      companyName: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      leadSource: { type: "string" },
      notes: { type: "string" },
    },
    required: ["firstName", "lastName"],
  },
  confirmSummary: (i) =>
    `Create lead “${str(i, "firstName") ?? ""} ${str(i, "lastName") ?? ""}”${
      str(i, "companyName") ? ` at ${str(i, "companyName")}` : ""
    }${str(i, "email") ? ` (${str(i, "email")})` : ""}.`,
  run: async (input, ctx) => {
    const firstName = str(input, "firstName");
    const lastName = str(input, "lastName");
    if (!firstName || !lastName) return { ok: false, error: "First and last name are required." };
    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        companyName: str(input, "companyName") ?? null,
        leadSource: str(input, "leadSource") ?? null,
        email: str(input, "email") ?? null,
        phone: str(input, "phone") ?? null,
        notes: str(input, "notes") ?? null,
        ownerId: ctx.userId,
      },
    });
    safeRevalidate("/leads");
    return { ok: true, id: lead.id };
  },
};

const updateLeadTool: AgentTool = {
  name: "update_lead",
  description:
    "Update fields on an existing lead (name, company, email, phone, source, notes). Only pass fields you want to change.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Lead id." },
      firstName: { type: "string" },
      lastName: { type: "string" },
      companyName: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      leadSource: { type: "string" },
      notes: { type: "string" },
    },
    required: ["id"],
  },
  confirmSummary: (i) => {
    const fields = Object.keys(i).filter((k) => k !== "id");
    return `Update lead ${str(i, "id")}: change ${fields.join(", ") || "nothing"}.`;
  },
  run: async (input) => {
    const id = str(input, "id");
    if (!id) return { ok: false, error: "Missing lead id." };
    const data: Record<string, string | null> = {};
    for (const k of ["firstName", "lastName", "companyName", "email", "phone", "leadSource", "notes"]) {
      if (k in input) data[k] = str(input, k) ?? null;
    }
    if (Object.keys(data).length === 0) return { ok: false, error: "No fields to update." };
    await prisma.lead.update({ where: { id }, data });
    safeRevalidate(`/leads/${id}`);
    safeRevalidate("/leads");
    return { ok: true, id };
  },
};

const updateLeadStageTool: AgentTool = {
  name: "update_lead_stage",
  description:
    "Move a lead to a different pipeline stage (NEW, APPOINTMENT, PROPOSAL, CLOSED_WON, CLOSED_LOST).",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Lead id." },
      stage: { type: "string", enum: STAGES },
    },
    required: ["id", "stage"],
  },
  confirmSummary: (i) => `Move lead ${str(i, "id")} to stage ${str(i, "stage")}.`,
  run: async (input) => {
    const id = str(input, "id");
    const stage = str(input, "stage");
    if (!id || !stage || !STAGES.includes(stage as Stage)) return { ok: false, error: "Invalid id or stage." };
    await prisma.lead.update({ where: { id }, data: { stage: stage as Stage } });
    safeRevalidate(`/leads/${id}`);
    safeRevalidate("/leads");
    return { ok: true, id };
  },
};

const createTaskTool: AgentTool = {
  name: "create_task",
  description:
    "Create a task (action item) assigned to the current user, optionally tied to a lead and given a due date.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      dueDate: { type: "string", description: "ISO date/time, e.g. 2026-08-14 or 2026-08-14T15:00:00Z." },
      leadId: { type: "string", description: "Lead to attach the task to (optional)." },
    },
    required: ["description"],
  },
  confirmSummary: (i) =>
    `Create task “${str(i, "description")}”${str(i, "dueDate") ? ` due ${str(i, "dueDate")}` : ""}${
      str(i, "leadId") ? ` (lead ${str(i, "leadId")})` : ""
    }.`,
  run: async (input, ctx) => {
    const description = str(input, "description");
    if (!description) return { ok: false, error: "Task description is required." };
    const dueRaw = str(input, "dueDate");
    const leadId = str(input, "leadId");
    const due = dueRaw ? new Date(dueRaw) : null;
    if (due && Number.isNaN(due.getTime())) return { ok: false, error: "Invalid dueDate." };
    const task = await prisma.actionItem.create({
      data: { description, dueDate: due, assigneeId: ctx.userId, leadId: leadId ?? null },
    });
    return { ok: true, id: task.id };
  },
};

const logActivityTool: AgentTool = {
  name: "log_activity",
  description:
    "Log an activity on a lead's timeline (a call, text, note, meeting, or other). Does not send anything — use send_email for outbound email.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      leadId: { type: "string" },
      type: { type: "string", enum: ["CALL", "TEXT", "NOTE", "MEETING", "OTHER"] },
      direction: { type: "string", enum: ["IN", "OUT"], description: "Default OUT." },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["leadId", "type"],
  },
  confirmSummary: (i) =>
    `Log ${str(i, "type")} activity on lead ${str(i, "leadId")}${
      str(i, "subject") ? `: “${str(i, "subject")}”` : ""
    }.`,
  run: async (input, ctx) => {
    const leadId = str(input, "leadId");
    const type = str(input, "type");
    const allowed = ["CALL", "TEXT", "NOTE", "MEETING", "OTHER"];
    if (!leadId || !type || !allowed.includes(type)) return { ok: false, error: "leadId and a valid type are required." };
    const direction = str(input, "direction") === "IN" ? "IN" : "OUT";
    await prisma.activity.create({
      data: {
        leadId,
        userId: ctx.userId,
        type: type as ActivityType,
        direction: direction as Direction,
        subject: str(input, "subject") ?? null,
        body: str(input, "body") ?? null,
      },
    });
    safeRevalidate(`/leads/${leadId}`);
    return { ok: true };
  },
};

const createAppointmentTool: AgentTool = {
  name: "create_appointment",
  description:
    "Create a simple appointment on an existing lead at a specific time (no invitee email or Outlook/Zoom). For a full client-facing booking with a Zoom link and confirmation email, use book_call instead.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      leadId: { type: "string" },
      title: { type: "string" },
      scheduledAt: { type: "string", description: "ISO date/time." },
      durationMin: { type: "integer", description: "Default 30." },
      notes: { type: "string" },
    },
    required: ["leadId", "title", "scheduledAt"],
  },
  confirmSummary: (i) =>
    `Create appointment “${str(i, "title")}” for lead ${str(i, "leadId")} at ${str(i, "scheduledAt")}.`,
  run: async (input, ctx) => {
    const leadId = str(input, "leadId");
    const title = str(input, "title");
    const scheduledAtRaw = str(input, "scheduledAt");
    if (!leadId || !title || !scheduledAtRaw) return { ok: false, error: "leadId, title, and scheduledAt are required." };
    const scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "Invalid scheduledAt." };
    const durationMin = Number(input.durationMin) > 0 ? Math.floor(Number(input.durationMin)) : 30;
    const appt = await prisma.appointment.create({
      data: {
        leadId,
        ownerId: ctx.userId,
        title,
        scheduledAt,
        durationMin,
        notes: str(input, "notes") ?? null,
      },
    });
    await prisma.lead.updateMany({ where: { id: leadId, stage: "NEW" }, data: { stage: "APPOINTMENT" } });
    safeRevalidate("/appointments");
    return { ok: true, id: appt.id };
  },
};

const bookCallTool: AgentTool = {
  name: "book_call",
  description:
    "Book a client-facing call on one of the firm's booking event types. Validates the slot against real availability, creates/matches the lead, puts it on the host's Outlook calendar with a Zoom link, and emails a confirmation. Use list_event_types first to get a valid eventTypeId and confirm the time is open.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      eventTypeId: { type: "string", description: "From list_event_types." },
      startISO: { type: "string", description: "UTC ISO start instant of an available slot." },
      name: { type: "string", description: "Invitee full name." },
      email: { type: "string", description: "Invitee email." },
      phone: { type: "string" },
      inviteeTimezone: { type: "string", description: "IANA tz, e.g. America/New_York." },
    },
    required: ["eventTypeId", "startISO", "name", "email", "inviteeTimezone"],
  },
  confirmSummary: (i) =>
    `Book a call for ${str(i, "name")} (${str(i, "email")}) at ${str(i, "startISO")} — sends an Outlook invite + confirmation email.`,
  run: async (input) => {
    const eventTypeId = str(input, "eventTypeId");
    const startISO = str(input, "startISO");
    const name = str(input, "name");
    const email = str(input, "email");
    const inviteeTimezone = str(input, "inviteeTimezone");
    if (!eventTypeId || !startISO || !name || !email || !inviteeTimezone) {
      return { ok: false, error: "eventTypeId, startISO, name, email, and inviteeTimezone are required." };
    }
    return createBooking({
      eventTypeId, startISO, name, email,
      phone: str(input, "phone"), inviteeTimezone,
    }) as Promise<ToolResult>;
  },
};

const listEventTypes: AgentTool = {
  name: "list_event_types",
  description:
    "List the current user's active booking event types (call options) with their id, name, duration, and slug. Use before book_call.",
  mode: "read",
  input_schema: { type: "object", properties: {} },
  run: async (_input, ctx) => {
    const host = await prisma.bookingHost.findUnique({
      where: { userId: ctx.userId },
      include: { eventTypes: { where: { active: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!host) return { ok: true, count: 0, eventTypes: [], note: "No booking host set up yet." };
    return {
      ok: true,
      count: host.eventTypes.length,
      hostSlug: host.slug,
      eventTypes: host.eventTypes.map((e) => ({
        id: e.id, name: e.name, slug: e.slug, durationMin: e.durationMin,
      })),
    };
  },
};

const sendEmailTool: AgentTool = {
  name: "send_email",
  description:
    "Send an email to a lead from the current user's Microsoft 365 mailbox and log it on the lead's timeline. Requires an existing lead. Plain-text body; newlines become line breaks.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: {
      leadId: { type: "string" },
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["leadId", "to", "subject", "body"],
  },
  confirmSummary: (i) => `Send email to ${str(i, "to")} — “${str(i, "subject")}”.`,
  run: async (input, ctx) => {
    const leadId = str(input, "leadId");
    const to = str(input, "to");
    const subject = str(input, "subject");
    const body = str(input, "body");
    if (!leadId || !to || !subject || !body) return { ok: false, error: "leadId, to, subject, and body are required." };
    const html = body.replace(/\n/g, "<br/>");
    if (graphConfigured()) {
      const sent = await sendMailAsUser({ userId: ctx.userId, to, subject, html });
      if (!sent.ok) return { ok: false, error: sent.error ?? "Failed to send." };
    }
    await prisma.activity.create({
      data: {
        leadId,
        userId: ctx.userId,
        type: "EMAIL_SENT",
        direction: "OUT",
        subject,
        body,
        metadata: { channel: graphConfigured() ? "graph" : "offline-log" },
      },
    });
    safeRevalidate(`/leads/${leadId}`);
    return { ok: true, offline: !graphConfigured() };
  },
};

const deleteAppointmentTool: AgentTool = {
  name: "delete_appointment",
  description:
    "Permanently delete an appointment (and its action items). Best-effort removes the linked Outlook event. Irreversible — use only when the user clearly asks to delete a specific appointment.",
  mode: "write",
  input_schema: {
    type: "object",
    properties: { id: { type: "string", description: "Appointment id." } },
    required: ["id"],
  },
  confirmSummary: (i) => `Delete appointment ${str(i, "id")} — this is permanent.`,
  run: async (input) => {
    const id = str(input, "id");
    if (!id) return { ok: false, error: "Missing appointment id." };
    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { ownerId: true, graphEventId: true },
    });
    if (!appt) return { ok: false, error: "Appointment not found." };
    if (appt.graphEventId && appt.ownerId) {
      await deleteCalendarEvent(appt.ownerId, appt.graphEventId);
    }
    await prisma.appointment.delete({ where: { id } });
    safeRevalidate("/appointments");
    return { ok: true };
  },
};

export const AGENT_TOOLS: AgentTool[] = [
  // reads
  listLeads,
  getLead,
  listAppointments,
  listProposals,
  listTasks,
  pipelineSummary,
  listEventTypes,
  // writes
  createLeadTool,
  updateLeadTool,
  updateLeadStageTool,
  createTaskTool,
  logActivityTool,
  createAppointmentTool,
  bookCallTool,
  sendEmailTool,
  deleteAppointmentTool,
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  AGENT_TOOLS.map((t) => [t.name, t]),
);

/** The `tools` array passed to the Messages API (schema only, no run/mode). */
export function anthropicToolDefs(): Anthropic.Tool[] {
  return AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

/** Human-readable confirmation text for a pending write (card copy). */
export function confirmSummaryFor(name: string, input: Record<string, unknown>): string {
  const tool = TOOLS_BY_NAME[name];
  if (tool?.confirmSummary) return tool.confirmSummary(input);
  return `Run ${name} with ${JSON.stringify(input)}.`;
}
