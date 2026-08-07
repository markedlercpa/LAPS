// Work — Capacity module shared taxonomy. Client-safe (no prisma import).

/** Role bands (pricing tiers). Seeded lazily; rates live in RoleBandRate. */
export const ROLE_BAND_SEED = [
  { name: "Associate", targetUtilization: 0.8, sortOrder: 10 },
  { name: "Senior Associate", targetUtilization: 0.8, sortOrder: 20 },
  { name: "Manager", targetUtilization: 0.6, sortOrder: 30 },
  { name: "Tax Review", targetUtilization: 0.5, sortOrder: 40 },
] as const;

export const ENGAGEMENT_TYPES = ["qoe", "cas_monthly", "tax", "advisory", "other"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];
export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  qoe: "Quality of Earnings",
  cas_monthly: "CAS — Monthly",
  tax: "Tax",
  advisory: "Advisory",
  other: "Other",
};

export const REVENUE_RECOGNITION = ["fixed_on_completion", "monthly", "pct_hours"] as const;
export type RevenueRecognition = (typeof REVENUE_RECOGNITION)[number];
export const REVENUE_RECOGNITION_LABELS: Record<RevenueRecognition, string> = {
  fixed_on_completion: "Fixed — on completion",
  monthly: "Monthly (recurring)",
  pct_hours: "% of budgeted hours consumed",
};

export const ENGAGEMENT_STATUSES = ["planned", "active", "on_hold", "complete"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];
export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  complete: "Complete",
};

/** Suggested skill tags (free-form; these seed the picker). */
export const SKILL_TAGS = [
  "qoe_data_layer",
  "monthly_close",
  "payroll",
  "nwc",
  "tax_prep",
  "proof_of_cash",
] as const;

export function labelFor<T extends string>(map: Record<string, string>, v: T): string {
  return map[v] ?? v;
}

// ── ISO-week helpers (UTC, ISO-8601) ────────────────────────────────────────

/** Date → ISO week string, e.g. "2026-W33". */
export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // shift to the week's Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** ISO week string → the Monday (00:00 UTC) that starts it. */
export function isoWeekStart(isoWeek: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) return new Date(NaN);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** The next `count` ISO weeks starting from `from` (default: this week). */
export function upcomingWeeks(count: number, from?: Date): string[] {
  const start = isoWeekStart(isoWeekOf(from ?? new Date()));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    out.push(isoWeekOf(d));
  }
  return out;
}

/** Format cents as USD. */
export function centsToUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
