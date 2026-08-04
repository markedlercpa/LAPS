"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ActivityTimeline,
  type ActivityRow,
} from "@/components/leads/activity-timeline";
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
  const [msg, setMsg] = useState<string | null>(null);

  // Log activity state
  const [logType, setLogType] = useState("CALL");
  const [logSubject, setLogSubject] = useState("");
  const [logBody, setLogBody] = useState("");

  // Email state
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
      } else setMsg(res.error ?? "Failed");
    });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await sendLeadEmail({ leadId, to, subject, body });
      if (res.ok) {
        setMsg(res.offline ? "Logged (M365 not connected — email not actually sent)." : "Email sent.");
        setSubject("");
        setBody("");
        router.refresh();
      } else setMsg(res.error ?? "Failed to send");
    });
  };

  const doSync = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await syncLeadInbound(leadId);
      if (res.ok) {
        setMsg(`Synced. ${res.created ?? 0} new inbound message(s).`);
        router.refresh();
      } else setMsg(res.error ?? "Sync failed");
    });
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email">Send Email</TabsTrigger>
          <TabsTrigger value="log">Log Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          <form onSubmit={submitEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[120px]"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send email"}
              </Button>
              {leadEmail && (
                <Button type="button" variant="outline" onClick={doSync} disabled={pending}>
                  <RefreshCw className="h-4 w-4" />
                  Sync replies
                </Button>
              )}
            </div>
          </form>
        </TabsContent>

        <TabsContent value="log">
          <form onSubmit={submitLog} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={logType} onChange={(e) => setLogType(e.target.value)}>
                  <option value="CALL">Call</option>
                  <option value="TEXT">Text</option>
                  <option value="NOTE">Note</option>
                  <option value="MEETING">Meeting</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={logSubject} onChange={(e) => setLogSubject(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Textarea value={logBody} onChange={(e) => setLogBody(e.target.value)} />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log activity"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Activity Timeline</h3>
        <ActivityTimeline activities={activities} />
      </div>
    </div>
  );
}
