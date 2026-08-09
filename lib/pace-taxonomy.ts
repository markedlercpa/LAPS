// PACE shared taxonomy — client-safe (no prisma import at runtime).
import type { StatementKind, LedgerProvider, PeriodStatus } from "@prisma/client";

export const STATEMENT_LABELS: Record<StatementKind, string> = {
  IS: "Income Statement",
  BS: "Balance Sheet",
};

export const PROVIDER_LABELS: Record<LedgerProvider, string> = {
  QBO: "QuickBooks Online",
  ZOHO: "Zoho Books",
  MANUAL: "Manual / CSV",
};

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
};

export const ENTITY_KINDS = ["operating", "holdco", "opm", "other"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  operating: "Operating company",
  holdco: "Holding company",
  opm: "OPM",
  other: "Other",
};
