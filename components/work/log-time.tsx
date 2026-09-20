"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { logTimeAction } from "@/app/(dashboard)/work/capacity/actions";

/** Inline timesheet entry: pick person + engagement + day + hours. */
export function LogTimeForm({
  resources,
  engagements,
  defaultEngagementId,
}: {
  resources: { id: string; name: string }[];
  engagements: { id: string; label: string }[];
  defaultEngagementId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function submit(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await logTimeAction({
        resourceId: fd.get("resourceId"),
        engagementId: fd.get("engagementId"),
        workDate: fd.get("workDate"),
        hours: fd.get("hours"),
        notes: fd.get("notes") || undefined,
        billable: fd.get("billable") === "on",
      });
      if (res.ok) {
        setMsg("Logged.");
        router.refresh();
        (document.getElementById("log-time-form") as HTMLFormElement | null)?.reset();
      } else setMsg(res.error);
    });
  }

  if (resources.length === 0 || engagements.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Add at least one <a className="text-accent-700" href="/work/capacity/resources">resource</a> and one{" "}
        <a className="text-accent-700" href="/work/capacity/engagements">engagement</a> before logging time.
      </p>
    );
  }

  return (
    <form id="log-time-form" action={submit} className="card flex flex-wrap items-end gap-2 p-4">
      <label className="field">
        <span className="micro-label">Person</span>
        <select name="resourceId" className="input" required>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="field min-w-[220px] flex-1">
        <span className="micro-label">Engagement</span>
        <select name="engagementId" className="input" required defaultValue={defaultEngagementId}>
          {engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="micro-label">Date</span>
        <input name="workDate" type="date" className="input" required defaultValue={today} />
      </label>
      <label className="field">
        <span className="micro-label">Hours</span>
        <input name="hours" type="number" min="0.25" max="24" step="0.25" className="input w-24 text-right" required />
      </label>
      <label className="field flex-1">
        <span className="micro-label">Notes (optional)</span>
        <input name="notes" className="input" />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-[13px]">
        <input name="billable" type="checkbox" defaultChecked /> Billable
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Clock className="h-4 w-4" /> {pending ? "Logging…" : "Log time"}
      </button>
      {msg && <span className="pb-2 text-[12px] text-muted">{msg}</span>}
    </form>
  );
}
