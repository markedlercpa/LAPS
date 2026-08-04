import type { Stage, ProposalStatus, AppointmentStatus } from "@prisma/client";

export const LEAD_SOURCES = [
  "Referral",
  "Website",
  "LinkedIn",
  "Cold Email",
  "Cold Call",
  "Event / Conference",
  "Partner",
  "Inbound Content",
  "Other",
] as const;

export const STAGE_LABELS: Record<Stage, string> = {
  NEW: "New Lead",
  APPOINTMENT: "Appointment",
  PROPOSAL: "Proposal",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

export const STAGE_COLORS: Record<Stage, string> = {
  NEW: "bg-slate-100 text-slate-700",
  APPOINTMENT: "bg-blue-100 text-blue-700",
  PROPOSAL: "bg-amber-100 text-amber-700",
  CLOSED_WON: "bg-green-100 text-green-700",
  CLOSED_LOST: "bg-red-100 text-red-700",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  WON: "Won",
  LOST: "Lost",
};

export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-indigo-100 text-indigo-700",
  SIGNED: "bg-purple-100 text-purple-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  BOOKED: "Booked",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  CANCELED: "Canceled",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  BOOKED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  NO_SHOW: "bg-red-100 text-red-700",
  CANCELED: "bg-slate-100 text-slate-700",
};

// Onboarding checklist template seeded onto each new client handoff.
export const ONBOARDING_CHECKLIST_TEMPLATE: string[] = [
  "Send welcome / surprise gift",
  "Schedule onboarding kickoff call",
  "Send onboarding questionnaire & document requests",
  "Complete internal delivery handoff",
  "Confirm activation point hit on time",
  "Capture case study",
  "Request Google review",
];
