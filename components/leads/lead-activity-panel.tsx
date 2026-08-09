"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MicroLabel } from "@/components/micro-label";
import { ActivityTimeline, type ActivityRow } from "@/components/leads/activity-timeline";
import { logActivity, sendLeadEmail, syncLeadInbound } from "@/app/(dashboard)/leads/actions";

export function LeadActivityPanel({
  leadId,
  leadEmail,
  activities,
}: {
  leadId: string;
  leadEmail: string | null;
  activities: ActivityRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [logType, setLogType] = useState("CALL");
  const [logSubject, setLogSubject] = useState("");
  const [logBody, setLogBody] = useState("");

  const [to, setTo] = useState(leadEmail ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const submitLog = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await logActivity({ leadId, type: logType, subject: logSubject, body: logBody });
      if (res.ok) {
        setLogSubject("");
        setLogBody("");
        router.refresh();
      } else setMsg({ text: res.error ?? "Failed", error: true });
    });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await sendLeadEmail({ leadId, to, subject, body });
      if (res.ok) {
        setMsg({
          text: res.offline
            ? "Logged (M365 not connected — email not actually sent)."
            : "Email sent.",
        });
        setSubject("");
        setBody("");
        router.refresh();
      } else setMsg({ text: res.error ?? "Failed to send", error: true });
    });
  };

  const doSync = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await syncLeadInbound(leadId);
      if (res.ok) {
        setMsg({ text: `Synced. ${res.created ?? 0} new inbound message(s).` });
        router.refresh();
      } else setMsg({ text: res.error ?? "Sync failed", error: true });
    });
  };

  return (
    <div>
      <MicroLabel>Interactions</MicroLabel>

      <Tabs defaultValue="email" className="mt-3">
        <TabsList>
          <TabsTrigger value="email">Send email</TabsTrigger>
          <TabsTrigger value="log">Log activity</TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          <form onSubmit={submitEmail} className="field space-y-3">
            <div>
              <label>To</label>
              <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <div>
              <label>Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            <div>
              <label>Message</label>
              <textarea
                className="input min-h-[120px]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                <Mail className="h-4 w-4" />
                {pending ? "Sending…" : "Send email"}
              </button>
              {leadEmail && (
                <button type="button" className="btn btn-secondary" onClick={doSync} disabled={pending}>
                  <RefreshCw className="h-4 w-4" />
                  Sync replies
                </button>
              )}
            </div>
          </form>
        </TabsContent>

        <TabsContent value="log">
          <form onSubmit={submitLog} className="field space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Type</label>
                <select className="input" value={logType} onChange={(e) => setLogType(e.target.value)}>
                  <option value="CALL">Call</option>
                  <option value="TEXT">Text</option>
                  <option value="NOTE">Note</option>
                  <option value="MEETING">Meeting</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label>Subject</label>
                <input className="input" value={logSubject} onChange={(e) => setLogSubject(e.target.value)} />
              </div>
            </div>
            <div>
              <label>Details</label>
              <textarea className="input" value={logBody} onChange={(e) => setLogBody(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Log activity"}
            </button>
          </form>
        </TabsContent>
      </Tabs>

      {msg && (
        <p className={msg.error ? "mt-3 text-[14px] text-accent-700" : "mt-3 text-[14px] text-muted"}>
          {msg.text}
        </p>
      )}

      <hr className="hr" />
      <MicroLabel>Activity timeline</MicroLabel>
      <div className="mt-2">
        <ActivityTimeline activities={activities} />
      </div>
    </div>
  );
}
