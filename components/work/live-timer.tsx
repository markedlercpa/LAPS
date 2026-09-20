"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { logTimeAction } from "@/app/(dashboard)/work/capacity/actions";

type Running = { resourceId: string; engagementId: string; notes: string; startedAt: number };
const KEY = "pulse.livetimer";

/** A start/stop work timer. Survives refresh via localStorage; on stop it logs
 * the elapsed time (rounded to 0.25h) as a billable time entry for today. */
export function LiveTimer({
  resources,
  engagements,
}: {
  resources: { id: string; name: string }[];
  engagements: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<Running | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [engagementId, setEngagementId] = useState(engagements[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore a running timer on mount.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) {
      try {
        const r = JSON.parse(raw) as Running;
        setRunning(r);
        setResourceId(r.resourceId);
        setEngagementId(r.engagementId);
        setNotes(r.notes);
      } catch {
        window.localStorage.removeItem(KEY);
      }
    }
  }, []);

  // Drive the elapsed display while running.
  useEffect(() => {
    if (!running) {
      if (tick.current) clearInterval(tick.current);
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.floor((Date.now() - running.startedAt) / 1000));
    update();
    tick.current = setInterval(update, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const start = () => {
    if (!resourceId || !engagementId) return;
    const r: Running = { resourceId, engagementId, notes, startedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(r));
    setRunning(r);
    setMsg(null);
  };

  const stop = () => {
    if (!running) return;
    const seconds = Math.floor((Date.now() - running.startedAt) / 1000);
    const hours = Math.max(0.25, Math.round((seconds / 3600) * 4) / 4); // round to 0.25h, min 0.25
    window.localStorage.removeItem(KEY);
    const snapshot = running;
    setRunning(null);
    startTransition(async () => {
      const res = await logTimeAction({
        resourceId: snapshot.resourceId,
        engagementId: snapshot.engagementId,
        workDate: new Date().toISOString().slice(0, 10),
        hours,
        notes: snapshot.notes || undefined,
        billable: true,
      });
      setMsg(res.ok ? `Logged ${hours}h.` : res.error);
      if (res.ok) router.refresh();
    });
  };

  const hms = `${String(Math.floor(elapsed / 3600)).padStart(2, "0")}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  if (resources.length === 0 || engagements.length === 0) return null;

  return (
    <div className="card flex flex-wrap items-end gap-2 p-4">
      <div className="flex items-baseline gap-2">
        <span className="micro-label">Live timer</span>
        {running && <span className="font-heading text-[20px] font-extrabold tabular-nums text-accent-700">{hms}</span>}
      </div>
      <label className="field">
        <span className="micro-label">Person</span>
        <select className="input" value={resourceId} disabled={!!running} onChange={(e) => setResourceId(e.target.value)}>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="field min-w-[220px] flex-1">
        <span className="micro-label">Engagement</span>
        <select className="input" value={engagementId} disabled={!!running} onChange={(e) => setEngagementId(e.target.value)}>
          {engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="field flex-1">
        <span className="micro-label">Notes</span>
        <input className="input" value={notes} disabled={!!running} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {running ? (
        <button className="btn btn-primary" onClick={stop} disabled={pending}>
          <Square className="h-4 w-4" /> Stop & log
        </button>
      ) : (
        <button className="btn btn-secondary" onClick={start} disabled={!resourceId || !engagementId}>
          <Play className="h-4 w-4" /> Start
        </button>
      )}
      {msg && <span className="pb-2 text-[12px] text-muted">{msg}</span>}
    </div>
  );
}
