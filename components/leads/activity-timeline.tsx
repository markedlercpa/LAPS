"use client";

import type { ActivityType } from "@prisma/client";
import {
  Mail,
  MailOpen,
  Phone,
  MessageSquare,
  StickyNote,
  CalendarDays,
  Circle,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  direction: "IN" | "OUT";
  subject: string | null;
  body: string | null;
  occurredAt: string;
  userName: string;
};

const ICONS: Record<ActivityType, typeof Mail> = {
  EMAIL_SENT: Mail,
  EMAIL_RECEIVED: MailOpen,
  CALL: Phone,
  TEXT: MessageSquare,
  NOTE: StickyNote,
  MEETING: CalendarDays,
  OTHER: Circle,
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

export function ActivityTimeline({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity logged yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {activities.map((a) => {
        const Icon = ICONS[a.type];
        return (
          <li key={a.id} className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {LABELS[a.type]}
                  {a.subject ? <span className="font-normal">: {a.subject}</span> : null}
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(a.occurredAt)}
                </span>
              </div>
              {a.body && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                {a.direction === "IN" ? "Inbound" : "Outbound"} · {a.userName}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
