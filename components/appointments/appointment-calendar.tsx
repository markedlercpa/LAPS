"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addWeeks,
  addDays,
  endOfDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalendarAppt = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
};

type View = "month" | "week" | "day" | "agenda";
const VIEWS: View[] = ["month", "week", "day", "agenda"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AppointmentCalendar({ appts }: { appts: CalendarAppt[] }) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(new Date());

  const events = useMemo(
    () => appts.map((a) => ({ ...a, date: new Date(a.scheduledAt) })),
    [appts],
  );

  const shift = (dir: number) => {
    if (view === "month") setCursor((d) => addMonths(d, dir));
    else if (view === "week") setCursor((d) => addWeeks(d, dir));
    else setCursor((d) => addDays(d, dir));
  };

  const heading =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `Week of ${format(startOfWeek(cursor, { weekStartsOn: 1 }), "MMM d, yyyy")}`
        : view === "day"
          ? format(cursor, "EEEE, MMM d, yyyy")
          : "Upcoming";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-divider py-4">
        <div className="flex items-center gap-2">
          {view !== "agenda" && (
            <>
              <button className="btn btn-secondary btn-icon" onClick={() => shift(-1)} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => shift(1)} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <h4 className="mb-0">{heading}</h4>
        </div>
        <div className="seg">
          {VIEWS.map((v) => (
            <label key={v} className="seg-opt capitalize">
              <input type="radio" name="calview" checked={view === v} onChange={() => setView(v)} />
              {v}
            </label>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid cursor={cursor} events={events} />
      ) : view === "agenda" ? (
        <Agenda events={events.filter((e) => e.date >= startOfDay(new Date()))} />
      ) : (
        <Agenda events={eventsInRange(events, view, cursor)} empty="No appointments in this range." />
      )}
    </div>
  );
}

function eventsInRange(
  events: (CalendarAppt & { date: Date })[],
  view: View,
  cursor: Date,
) {
  const start = view === "week" ? startOfWeek(cursor, { weekStartsOn: 1 }) : startOfDay(cursor);
  const end = view === "week" ? endOfWeek(cursor, { weekStartsOn: 1 }) : endOfDay(cursor);
  return events
    .filter((e) => isWithinInterval(e.date, { start, end }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function MonthGrid({
  cursor,
  events,
}: {
  cursor: Date;
  events: (CalendarAppt & { date: Date })[];
}) {
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="border-l border-t border-divider">
      <div className="grid grid-cols-7">
        {DOW.map((d) => (
          <div
            key={d}
            className="micro-label border-b-2 border-r border-divider px-3 py-2"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const dayEvents = events
            .filter((e) => isSameDay(e.date, day))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[104px] border-b border-r border-divider p-2",
                !inMonth && "bg-neutral-200",
              )}
            >
              <div className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]">
                {format(day, "d")}
              </div>
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "mt-2 px-2 py-[5px] text-[11px] leading-[1.3]",
                    e.status === "BOOKED"
                      ? "bg-accent text-bg"
                      : "bg-surface text-ink",
                  )}
                  title={e.title}
                >
                  {format(e.date, "h:mm a")} {e.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  events,
  empty = "No upcoming appointments.",
}: {
  events: (CalendarAppt & { date: Date })[];
  empty?: string;
}) {
  const sorted = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length === 0) {
    return <p className="py-6 text-[14px] text-muted">{empty}</p>;
  }
  return (
    <div className="border-t-2 border-divider">
      {sorted.map((e) => (
        <div
          key={e.id}
          className="grid grid-cols-[160px_1fr_auto] items-center gap-4 border-b border-divider py-3 max-sm:grid-cols-1 max-sm:gap-1"
        >
          <div className="text-[13px] [font-variant-numeric:tabular-nums]">
            {format(e.date, "EEE, MMM d · h:mm a")}
          </div>
          <div className="font-heading text-[14px] font-extrabold">{e.title}</div>
          <span
            className={cn("tag", e.status === "BOOKED" ? "tag-outline" : "tag-neutral")}
          >
            {e.status}
          </span>
        </div>
      ))}
    </div>
  );
}
