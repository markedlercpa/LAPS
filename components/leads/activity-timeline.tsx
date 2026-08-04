"use client";

import type { ActivityType } from "@prisma/client";
import { cn } from "@/lib/utils";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  direction: "IN" | "OUT";
  subject: string | null;
  body: string | null;
  occurredAt: string;
  userName: string;
};

const LABELS: Record<ActivityType, string> = {
  EMAIL_SENT: "Email sent",
  EMAIL_RECEIVED: "Email received",
  CALL: "Call",
  TEXT: "Text",
  NOTE: "Note",
  MEETING: "Meeting",
  OTHER: "Activity",
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ActivityTimeline({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) {
    return <p className="py-6 text-[14px] text-muted">No activity logged yet.</p>;
  }

  return (
    <div>
      {activities.map((a) => (
        <div
          key={a.id}
          className="grid grid-cols-[120px_1fr] gap-6 border-b border-divider py-4 max-sm:grid-cols-1 max-sm:gap-1"
        >
          <div>
            <div className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]">
              {fmtDate(a.occurredAt)}
            </div>
            <div className="text-[12px] text-muted">{fmtTime(a.occurredAt)}</div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("tag", a.type === "CALL" ? "tag-accent" : "tag-neutral")}>
                {LABELS[a.type]}
              </span>
              {a.subject && (
                <span className="font-heading text-[14px] font-extrabold">{a.subject}</span>
              )}
            </div>
            {a.body && (
              <p className="mb-0 mt-1 whitespace-pre-wrap text-[14px] text-muted">{a.body}</p>
            )}
            <div className="mt-1 text-[11px] text-muted">
              {a.direction === "IN" ? "Inbound" : "Outbound"} · {a.userName}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
