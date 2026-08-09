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

// Modernist mono palette has no blue/amber/green — map stages to tag classes.
export const STAGE_COLORS: Record<Stage, string> = {
  NEW: "tag-neutral",
  APPOINTMENT: "tag-neutral",
  PROPOSAL: "tag-outline",
  CLOSED_WON: "tag-accent",
  CLOSED_LOST: "tag-neutral",
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
  DRAFT: "tag-neutral",
  SENT: "tag-outline",
  VIEWED: "tag-outline",
  SIGNED: "tag-outline",
  WON: "tag-accent",
  LOST: "tag-neutral",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  BOOKED: "Booked",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  CANCELED: "Canceled",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  BOOKED: "tag-outline",
  COMPLETED: "tag-neutral",
  NO_SHOW: "tag-accent",
  CANCELED: "tag-neutral",
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
