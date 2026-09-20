// STAPLE shared taxonomy — client-safe (no prisma import at runtime).
import type { StapleStage, InfoStatus, InfoSource, OwnerSide } from "@prisma/client";

/** Service lines STAPLE delivers. Stored as a plain string on Engagement. */
export const SERVICE_LINES = [
  "qofe_buyside",
  "qofe_sellside",
  "qoe_lite",
  "fractional_cfo",
  "controller",
  "cas",
  "tax_planning",
  "tax_compliance",
  "advisory_other",
] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  qofe_buyside: "QofE — Buyside",
  qofe_sellside: "QofE — Sellside",
  qoe_lite: "QoE Lite",
  fractional_cfo: "Fractional CFO",
  controller: "Controller",
  cas: "Client Accounting (CAS)",
  tax_planning: "Tax Planning",
  tax_compliance: "Tax Compliance",
  advisory_other: "Advisory (Other)",
};

export function serviceLineLabel(v: string): string {
  return (SERVICE_LINE_LABELS as Record<string, string>)[v] ?? v;
}

/** The six STAPLE stages in order (+ terminal CLOSED). */
export const STAGE_ORDER: StapleStage[] = [
  "STAGING",
  "TAKEOFF",
  "ASSEMBLE",
  "PACKAGE",
  "DELIVERED",
  "LEVERAGE",
  "EVANGELIZE",
  "CLOSED",
];

export const STAGE_LABELS: Record<StapleStage, string> = {
  STAGING: "Staging",
  TAKEOFF: "Takeoff",
  ASSEMBLE: "Assemble",
  PACKAGE: "Package",
  DELIVERED: "Delivered",
  LEVERAGE: "Leverage",
  EVANGELIZE: "Evangelize",
  CLOSED: "Closed",
};

/** The next stage in the pipeline, or null at the end. */
export function nextStage(stage: StapleStage): StapleStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export const INFO_STATUS_LABELS: Record<InfoStatus, string> = {
  RECEIVED: "Received",
  REQUESTED: "Requested",
  PROMISED: "Promised",
  NOT_APPLICABLE: "N/A",
};

export const INFO_SOURCE_LABELS: Record<InfoSource, string> = {
  SALES_HANDOFF: "Sales handoff",
  CLIENT_UPLOAD: "Client upload",
  EMAIL: "Email",
  KICKOFF: "Kickoff",
  PRIOR_ENGAGEMENT: "Prior engagement",
  MANUAL: "Manual",
};

export const OWNER_SIDE_LABELS: Record<OwnerSide, string> = {
  US: "Us",
  CLIENT: "Client",
  THIRD_PARTY: "Third party",
};
