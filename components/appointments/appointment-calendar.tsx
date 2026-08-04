"use client";

import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useMemo, useState } from "react";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

export type CalendarAppt = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
};

export default function AppointmentCalendar({ appts }: { appts: CalendarAppt[] }) {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());

  const events = useMemo(
    () =>
      appts.map((a) => {
        const start = new Date(a.scheduledAt);
        return {
          id: a.id,
          title: `${a.title} (${a.status})`,
          start,
          end: new Date(start.getTime() + a.durationMin * 60_000),
        };
      }),
    [appts],
  );

  return (
    <div className="rounded-lg border bg-card p-4" style={{ height: 600 }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={["month", "week", "day", "agenda"]}
        popup
      />
    </div>
  );
}
