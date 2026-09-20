/**
 * ECHO → LAPS trust score — client-safe taxonomy (no Prisma import).
 *
 * Trust is earned in ECHO through content engagement, then converted in LAPS.
 * A lead's trust score is the sum of weighted signals, capped at 100, bucketed
 * into a warmth band shown in the pipeline and lead lists.
 */

export const TRUST_SIGNAL_KINDS = [
  "CONTENT_VIEW",
  "CONTENT_ENGAGE",
  "EMAIL_REPLY",
  "MEETING_ATTENDED",
  "WEBINAR",
  "DOWNLOAD",
  "REFERRAL",
  "INBOUND_INQUIRY",
  "MANUAL",
] as const;

export type TrustSignalKind = (typeof TRUST_SIGNAL_KINDS)[number];

export const TRUST_SIGNAL_LABELS: Record<TrustSignalKind, string> = {
  CONTENT_VIEW: "Viewed content",
  CONTENT_ENGAGE: "Engaged (like/comment/share)",
  EMAIL_REPLY: "Replied to email",
  MEETING_ATTENDED: "Attended meeting",
  WEBINAR: "Attended webinar",
  DOWNLOAD: "Downloaded asset",
  REFERRAL: "Referral",
  INBOUND_INQUIRY: "Inbound inquiry",
  MANUAL: "Manual adjustment",
};

/** Default point value for each signal kind (overridable per signal). */
export const TRUST_SIGNAL_WEIGHTS: Record<TrustSignalKind, number> = {
  CONTENT_VIEW: 3,
  CONTENT_ENGAGE: 8,
  EMAIL_REPLY: 10,
  MEETING_ATTENDED: 18,
  WEBINAR: 12,
  DOWNLOAD: 6,
  REFERRAL: 25,
  INBOUND_INQUIRY: 20,
  MANUAL: 0,
};

export const TRUST_SCORE_MAX = 100;

export type TrustBand = {
  key: "cold" | "cool" | "warming" | "warm" | "hot";
  label: string;
  /** CSS class for the tag treatment. */
  tag: string;
};

/** Bucket a 0–100 score into a warmth band. */
export function trustBand(score: number): TrustBand {
  if (score >= 75) return { key: "hot", label: "Hot", tag: "tag-accent" };
  if (score >= 50) return { key: "warm", label: "Warm", tag: "tag-outline" };
  if (score >= 25) return { key: "warming", label: "Warming", tag: "tag-neutral" };
  if (score >= 1) return { key: "cool", label: "Cool", tag: "tag-neutral" };
  return { key: "cold", label: "Cold", tag: "tag-neutral" };
}
