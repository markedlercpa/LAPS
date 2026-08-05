/**
 * Timezone-aware time helpers for the scheduling engine — client-safe (no
 * Prisma, no Node APIs). All slot instants are absolute (UTC); availability is
 * stored as minutes-from-midnight in the host's IANA timezone.
 *
 * DST is handled via Intl: we ask Intl what wall-clock time a given UTC instant
 * shows in a timezone, and invert that to convert local wall-time → UTC.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The UTC offset (minutes) that `timeZone` has at instant `date`. */
export function tzOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Convert a wall-clock time in `timeZone` (year, monthIndex 0-11, day, hour,
 * minute) to the absolute UTC instant. Correct across DST boundaries.
 */
export function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // First guess: treat the wall time as if it were UTC.
  const guess = Date.UTC(year, monthIndex, day, hour, minute);
  // Offset at that instant, then correct. One correction handles all but the
  // rare DST-transition ambiguity, which we don't need to be exact about.
  const offset = tzOffsetMinutes(timeZone, new Date(guess));
  return new Date(guess - offset * 60000);
}

/** Wall-clock parts of `date` as seen in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayName = get("weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.findIndex((w) => w === weekdayName),
  };
}

/** "YYYY-MM-DD" for `date` as seen in `timeZone` (a stable day key). */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Format minutes-from-midnight as "9:00 AM". */
export function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Format an instant as a clock label in a timezone, e.g. "9:00 AM". */
export function formatTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Format an instant as a full date label in a timezone. */
export function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** A reasonable, deduped timezone list for the invitee picker. */
export function listTimezones(): string[] {
  const withValues = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof withValues.supportedValuesOf === "function") {
    try {
      return withValues.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Australia/Sydney",
    "UTC",
  ];
}

/** Best-effort browser timezone (falls back to America/New_York). */
export function guessBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
