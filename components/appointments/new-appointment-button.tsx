"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAppointment, syncCalendar } from "@/app/(dashboard)/appointments/actions";

export type LeadOption = { id: string; name: string };

export function NewAppointmentButton({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [leadId, setLeadId] = useState("");
  const [title, setTitle] = useState("Discovery call");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState("30");
  const [notes, setNotes] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAppointment({ leadId, title, scheduledAt, durationMin, notes });
      if (res.ok) {
        setOpen(false);
        setScheduledAt("");
        router.refresh();
      } else setError(res.error ?? "Failed");
    });
  };

  const doSync = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await syncCalendar();
      setMsg(res.ok ? `Synced ${res.created ?? 0} appointment(s) from M365.` : res.error ?? "Sync failed");
      if (res.ok) router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={doSync} disabled={pending}>
          <RefreshCw className="h-4 w-4" />
          Sync M365 Calendar
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New Appointment
        </Button>
      </div>
      {msg && <p className="mt-2 text-right text-xs text-muted-foreground">{msg}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="New Appointment">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Lead *</Label>
            <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} required>
              <option value="">Select a lead…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date & time *</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create appointment"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
