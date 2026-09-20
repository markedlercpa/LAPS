// Lead-magnet taxonomy. Client-safe (no prisma / server imports).

export type LeadMagnetKindKey =
  | "EBOOK" | "TEMPLATE" | "TOOL" | "QUIZ" | "AUDIT_CALL"
  | "CALCULATOR" | "QBO_SNAPSHOT" | "WEBINAR" | "EMAIL_COURSE";

export const KIND_LABELS: Record<LeadMagnetKindKey, string> = {
  EBOOK: "E-book / guide",
  TEMPLATE: "Template",
  TOOL: "Tool / spreadsheet",
  QUIZ: "Quiz / scorecard",
  AUDIT_CALL: "Diagnostic / audit call",
  CALCULATOR: "Interactive calculator",
  QBO_SNAPSHOT: "Financial snapshot",
  WEBINAR: "Webinar / masterclass",
  EMAIL_COURSE: "Email course",
};

export const STATUS_LABELS: Record<"DRAFT" | "PUBLISHED" | "ARCHIVED", string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/** Base intent weight added to a lead's trust score on capture, by kind. */
export const DEFAULT_BASE_SCORE: Record<LeadMagnetKindKey, number> = {
  EBOOK: 10,
  TEMPLATE: 15,
  TOOL: 15,
  WEBINAR: 25,
  EMAIL_COURSE: 20,
  CALCULATOR: 30,
  QUIZ: 40,
  QBO_SNAPSHOT: 70,
  AUDIT_CALL: 80,
};

/** Kinds that deliver a downloadable file (Phase 1 functional set). */
export const DOWNLOAD_KINDS: LeadMagnetKindKey[] = ["EBOOK", "TEMPLATE", "TOOL"];
export function isDownloadKind(kind: string): boolean {
  return (DOWNLOAD_KINDS as string[]).includes(kind);
}

/** Kinds that are wired end-to-end today; others are scaffolded for later phases. */
export const LIVE_KINDS: LeadMagnetKindKey[] = ["EBOOK", "TEMPLATE", "TOOL", "QUIZ", "AUDIT_CALL", "CALCULATOR", "QBO_SNAPSHOT"];
export function isLiveKind(kind: string): boolean {
  return (LIVE_KINDS as string[]).includes(kind);
}
