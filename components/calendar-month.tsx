import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarEvent = {
  dateISO: string; // "YYYY-MM-DD"
  label: string;
  href?: string;
  tone?: "ink" | "accent" | "muted";
};

/** Zero-dep month grid (server-safe). `month` is "YYYY-MM"; events are placed on
 * their day. Prev/next navigate via the provided hrefs. Weeks start Monday. */
export function CalendarMonth({
  month,
  events,
  prevHref,
  nextHref,
}: {
  month: string;
  events: CalendarEvent[];
  prevHref: string;
  nextHref: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Monday-start offset (0 = Monday).
  const startOffset = (first.getUTCDay() + 6) % 7;
  const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const byDay = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const [ey, em, ed] = e.dateISO.split("-").map(Number);
    if (ey === y && em === m) {
      if (!byDay.has(ed)) byDay.set(ed, []);
      byDay.get(ed)!.push(e);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getUTCDate() && m - 1 === today.getUTCMonth() && y === today.getUTCFullYear();

  const toneClass = (t?: CalendarEvent["tone"]) =>
    t === "accent" ? "bg-accent text-bg" : t === "muted" ? "bg-surface text-muted" : "bg-ink text-bg";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link href={prevHref} className="btn btn-ghost btn-icon" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
        <div className="font-heading text-[16px] font-extrabold">{title}</div>
        <Link href={nextHref} className="btn btn-ghost btn-icon" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-divider">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b border-r border-divider bg-surface px-2 py-1.5 text-center micro-label">{d}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className="min-h-[92px] border-b border-r border-divider p-1.5 align-top">
            {d && (
              <>
                <div className={`text-[11px] ${isToday(d) ? "font-heading font-extrabold text-accent-700" : "text-muted"}`}>{d}</div>
                <div className="mt-1 space-y-1">
                  {(byDay.get(d) ?? []).map((e, j) =>
                    e.href ? (
                      <Link key={j} href={e.href} className={`block truncate rounded-sm px-1 py-0.5 text-[11px] no-underline ${toneClass(e.tone)}`}>
                        {e.label}
                      </Link>
                    ) : (
                      <div key={j} className={`truncate rounded-sm px-1 py-0.5 text-[11px] ${toneClass(e.tone)}`}>{e.label}</div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Prev/next "YYYY-MM" helpers. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
