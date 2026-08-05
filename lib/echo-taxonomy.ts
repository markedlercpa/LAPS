import type {
  QoOPillar,
  EvidenceType,
  EvidenceSource,
  Consent,
  CardCategory,
  CardStatus,
} from "@prisma/client";

/** ECHO shared taxonomy — client-safe (no prisma). */

export const PILLARS: QoOPillar[] = [
  "EARNINGS",
  "CASH_FLOW",
  "REPORTING",
  "GROWTH",
  "TAXATION",
  "CAPITAL",
  "LIFESTYLE",
  "VALUATION",
];

export const PILLAR_LABELS: Record<QoOPillar, string> = {
  EARNINGS: "Earnings",
  CASH_FLOW: "Cash Flow",
  REPORTING: "Reporting",
  GROWTH: "Growth",
  TAXATION: "Taxation",
  CAPITAL: "Capital",
  LIFESTYLE: "Lifestyle",
  VALUATION: "Valuation",
};

export const EVIDENCE_TYPES: EvidenceType[] = [
  "PAIN_POINT",
  "OBJECTION",
  "MYTH",
  "PRIZE_STATE",
  "CLIENT_STORY",
  "METHODOLOGY",
  "QUOTE",
  "DATA_POINT",
];

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  PAIN_POINT: "Pain point",
  OBJECTION: "Objection",
  MYTH: "Myth",
  PRIZE_STATE: "Prize state",
  CLIENT_STORY: "Client story",
  METHODOLOGY: "Methodology",
  QUOTE: "Quote",
  DATA_POINT: "Data point",
};

export const EVIDENCE_SOURCES: EvidenceSource[] = [
  "SALES_CALL",
  "CLIENT_ENGAGEMENT",
  "FIREFLIES_TRANSCRIPT",
  "EMAIL",
  "MANUAL",
];

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  SALES_CALL: "Sales call",
  CLIENT_ENGAGEMENT: "Client engagement",
  FIREFLIES_TRANSCRIPT: "Fireflies transcript",
  EMAIL: "Email",
  MANUAL: "Manual",
};

export const CONSENTS: Consent[] = ["INTERNAL_ONLY", "ANONYMIZED", "PUBLIC"];
export const CONSENT_LABELS: Record<Consent, string> = {
  INTERNAL_ONLY: "Internal only",
  ANONYMIZED: "Anonymized",
  PUBLIC: "Public",
};

export const CARD_CATEGORIES: CardCategory[] = [
  "HOOK",
  "REFRAME",
  "MANTRA",
  "OBJECTION_KILL",
  "PRIZE_FRAME",
  "MECHANISM_NAME",
];
export const CARD_CATEGORY_LABELS: Record<CardCategory, string> = {
  HOOK: "Hook",
  REFRAME: "Reframe",
  MANTRA: "Mantra",
  OBJECTION_KILL: "Objection kill",
  PRIZE_FRAME: "Prize frame",
  MECHANISM_NAME: "Mechanism name",
};

export const CARD_STATUSES: CardStatus[] = ["CANDIDATE", "ACTIVE", "RETIRED"];
export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  CANDIDATE: "Candidate",
  ACTIVE: "Active",
  RETIRED: "Retired",
};
