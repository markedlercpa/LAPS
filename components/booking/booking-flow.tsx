"use client";

import { useMemo, useState, useTransition } from "react";
import { Clock, Video, Globe, ArrowLeft, Check, Calendar } from "lucide-react";
import {
  zonedDateKey,
  formatTimeInZone,
  formatDateInZone,
  listTimezones,
  guessBrowserTimezone,
} from "@/lib/booking-time";
import { submitBooking, submitReschedule } from "@/app/book/actions";

export type Question = { id: string; label: string; type: "text" | "textarea" | "phone"; required: boolean };

const LOCATION_LABELS: Record<string, string> = {
  ZOOM: "Zoom (link sent on confirmation)",
  PHONE: "Phone call",
  IN_PERSON: "In person",
  CUSTOM: "Details on confirmation",
};

export function BookingFlow(props: {
  hostSlug: string;
  hostName: string;
  hostTimezone: string;
  eventTypeId: string;
  eventName: string;
  eventDescription: string | null;
  durationMin: number;
  locationType: string;
  slots: string[]; // UTC ISO
  questions: Question[];
  rescheduleToken: string | null;
  existingWhenISO: string | null;
}) {
  const [tz, setTz] = useState(() => guessBrowserTimezone());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form" | "done">("pick");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const isReschedule = Boolean(props.rescheduleToken);

  // Group slots by day-in-invitee-tz.
  const days = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of props.slots) {
      const key = zonedDateKey(new Date(s), tz);
      (map.get(key) ?? map.set(key, []).get(key)!).push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [props.slots, tz]);

  const activeDay = selectedDay ?? days[0]?.[0] ?? null;
  const daySlots = days.find(([k]) => k === activeDay)?.[1] ?? [];

  const dayLabel = (key: string) => {
    // key is YYYY-MM-DD in invitee tz; render via a noon-UTC anchor to avoid drift.
    const [y, m, d] = key.split("-").map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12));
    return {
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(anchor),
      day: d,
      month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(anchor),
    };
  };

  const chooseSlot = (s: string) => {
    setSlot(s);
    if (isReschedule) {
      setError(null);
      startTransition(async () => {
        const res = await submitReschedule(props.rescheduleToken!, s);
        if (!res.ok) setError(res.error ?? "Could not reschedule");
        else setStep("done");
      });
    } else {
      setStep("form");
    }
  };

  const submit = () => {
    setError(null);
    for (const q of props.questions) {
      if (q.required && !answers[q.id]?.trim()) {
        setError(`Please answer: ${q.label}`);
        return;
      }
    }
    startTransition(async () => {
      const res = await submitBooking({
        eventTypeId: props.eventTypeId,
        startISO: slot,
        name,
        email,
        phone: phone || undefined,
        inviteeTimezone: tz,
        answers,
      });
      if (!res.ok) setError(res.error ?? "Booking failed");
      else setStep("done");
    });
  };

  // ── Confirmation ──
  if (step === "done") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-accent">
          <Check className="h-7 w-7 text-accent" />
        </div>
        <h1>{isReschedule ? "Rescheduled" : "You're booked"}</h1>
        <p className="mt-2 text-muted">
          {props.eventName} with {props.hostName}
        </p>
        {slot && (
          <p className="mt-1 font-heading text-[18px] font-extrabold">
            {formatDateInZone(new Date(slot), tz)} · {formatTimeInZone(new Date(slot), tz)}
          </p>
        )}
        <p className="mt-4 text-[14px] text-muted">
          A confirmation with the meeting details {isReschedule ? "was updated and " : ""}is on its way to your inbox.
        </p>
      </div>
    );
  }

  // ── Form ──
  if (step === "form") {
    return (
      <div className="mx-auto max-w-xl px-5 py-10">
        <button className="btn btn-ghost mb-4 -ml-1" onClick={() => setStep("pick")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2>Enter your details</h2>
        {slot && (
          <p className="mt-1 text-muted">
            {formatDateInZone(new Date(slot), tz)} · {formatTimeInZone(new Date(slot), tz)} ({tz})
          </p>
        )}
        <div className="mt-5 space-y-3">
          <div className="field">
            <label>Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {props.questions.map((q) => (
            <div className="field" key={q.id}>
              <label>{q.label}{q.required ? " *" : ""}</label>
              {q.type === "textarea" ? (
                <textarea className="input" rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              ) : (
                <input className="input" type={q.type === "phone" ? "tel" : "text"} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-[14px] text-accent-700">{error}</p>}
        <button className="btn btn-primary btn-block mt-5 !justify-center" onClick={submit} disabled={pending || !name || !email}>
          {pending ? "Booking…" : "Confirm booking"}
        </button>
      </div>
    );
  }

  // ── Pick a time ──
  return (
    <div className="mx-auto grid min-h-screen max-w-4xl grid-cols-[280px_1fr] gap-0 px-5 py-10 max-md:grid-cols-1">
      {/* Left: event meta */}
      <div className="border-r-2 border-divider pr-6 max-md:border-r-0 max-md:border-b-2 max-md:pb-5">
        <div className="micro-label">{props.hostName}</div>
        <h2 className="mt-1">{props.eventName}</h2>
        {props.eventDescription && <p className="mt-2 text-[14px] text-muted">{props.eventDescription}</p>}
        <div className="mt-4 space-y-2 text-[14px] text-muted">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {props.durationMin} minutes</div>
          <div className="flex items-center gap-2"><Video className="h-4 w-4" /> {LOCATION_LABELS[props.locationType] ?? "Meeting"}</div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <select className="input !min-h-[30px] !w-auto py-0.5 text-[13px]" value={tz} onChange={(e) => { setTz(e.target.value); setSelectedDay(null); }}>
              {listTimezones().map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
        {isReschedule && props.existingWhenISO && (
          <div className="mt-4 border border-divider bg-surface p-3 text-[13px]">
            <div className="micro-label">Rescheduling</div>
            <div className="mt-1 text-muted">Currently: {formatDateInZone(new Date(props.existingWhenISO), tz)} · {formatTimeInZone(new Date(props.existingWhenISO), tz)}</div>
          </div>
        )}
      </div>

      {/* Right: day + time picker */}
      <div className="pl-6 max-md:pl-0 max-md:pt-5">
        {days.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted">
            <Calendar className="mb-2 h-8 w-8" />
            No times are available in the booking window. Please check back later.
          </div>
        ) : (
          <div className="grid grid-cols-[150px_1fr] gap-5 max-sm:grid-cols-1">
            {/* Day list */}
            <div className="max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
              {days.map(([key, list]) => {
                const dl = dayLabel(key);
                const on = key === activeDay;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(key)}
                    className={`flex w-full items-center justify-between border px-3 py-2 text-left text-[13px] ${on ? "border-accent bg-accent text-bg" : "border-divider bg-surface hover:border-accent"}`}
                  >
                    <span>
                      <span className="font-heading font-extrabold">{dl.weekday}</span> {dl.month} {dl.day}
                    </span>
                    <span className={on ? "text-bg" : "text-muted"}>{list.length}</span>
                  </button>
                );
              })}
            </div>

            {/* Times for the selected day */}
            <div>
              {activeDay && (
                <div className="micro-label mb-2">{formatDateInZone(new Date(`${activeDay}T12:00:00Z`), "UTC")}</div>
              )}
              <div className="grid max-h-[440px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {daySlots.map((s) => (
                  <button
                    key={s}
                    onClick={() => chooseSlot(s)}
                    disabled={pending}
                    className="border-2 border-divider bg-surface py-2 text-center text-[14px] font-heading font-extrabold hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {formatTimeInZone(new Date(s), tz)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[14px] text-accent-700">{error}</p>}
      </div>
    </div>
  );
}
