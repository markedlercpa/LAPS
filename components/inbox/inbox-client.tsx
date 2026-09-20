"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Archive,
  Reply,
  Tag,
  MailOpen,
  Plus,
  CalendarPlus,
  CheckSquare,
  UserPlus,
  History,
  Paperclip,
} from "lucide-react";
import type { MailListItem, MailFull } from "@/lib/graph";
import {
  loadEmail,
  replyEmail,
  archiveEmail,
  markEmail,
  tagEmail,
  createTaskFromEmail,
  createLeadFromEmail,
  logEmailToLead,
  replyWithBookingLink,
} from "@/app/(dashboard)/inbox/actions";

const PRESET_TAGS = ["Prospect", "Client", "Follow-up", "Billing", "Scheduling", "FYI"];

function fromLabel(m: { from: { name?: string; address?: string } | null }) {
  return m.from?.name || m.from?.address || "Unknown sender";
}
function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}
function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

type Panel = null | "reply" | "tag" | "task" | "lead" | "log";

export function InboxClient({
  messages,
  folder,
  baseUrl,
}: {
  messages: MailListItem[];
  folder: string;
  baseUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<MailFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // panel state
  const [replyText, setReplyText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");

  const select = (id: string) => {
    setSelectedId(id);
    setMsg(null);
    setPanel(null);
    setNotice(null);
    setError(null);
    setLoading(true);
    startTransition(async () => {
      const res = await loadEmail(id);
      setLoading(false);
      if (res.ok) {
        setMsg(res.message);
        setTags(res.message.categories ?? []);
        setLeadName(res.message.from?.name ?? "");
      } else setError(res.error ?? "Failed to load");
    });
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, opts?: { refreshList?: boolean; closePanel?: boolean }) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNotice(okMsg);
        if (opts?.closePanel !== false) setPanel(null);
        if (opts?.refreshList) {
          setSelectedId(null);
          setMsg(null);
          router.refresh();
        }
      } else setError(res.error ?? "Action failed");
    });
  };

  const senderEmail = msg?.from?.address;

  return (
    <div className="grid grid-cols-[minmax(280px,360px)_1fr] gap-0 border-2 border-divider max-md:grid-cols-1">
      {/* List */}
      <div className="max-h-[70vh] overflow-y-auto border-r border-divider max-md:max-h-[40vh]">
        {messages.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-muted">
            {folder === "archive" ? "Archive is empty." : "No messages."}
          </div>
        ) : (
          messages.map((m) => (
            <button
              key={m.id}
              onClick={() => select(m.id)}
              className={`block w-full border-b border-divider px-3 py-3 text-left hover:bg-surface ${
                selectedId === m.id ? "bg-surface" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {!m.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                <span className={`truncate text-[14px] ${m.isRead ? "" : "font-heading font-extrabold"}`}>
                  {fromLabel(m)}
                </span>
                {m.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-neutral-500" />}
                <span className="ml-auto shrink-0 text-[11px] text-muted">{timeLabel(m.receivedDateTime)}</span>
              </div>
              <div className={`mt-0.5 truncate text-[13px] ${m.isRead ? "text-muted" : ""}`}>{m.subject}</div>
              <div className="truncate text-[12px] text-neutral-500">{m.bodyPreview}</div>
              {m.categories.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.categories.map((c) => (
                    <span key={c} className="tag tag-outline text-[10px]">{c}</span>
                  ))}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Reading pane */}
      <div className="flex min-h-[70vh] flex-col max-md:min-h-[50vh]">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted">
            <Mail className="mb-2 h-8 w-8" />
            Select a message to read.
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-muted">Loading…</div>
        ) : msg ? (
          <>
            {/* Header + toolbar */}
            <div className="border-b border-divider p-4">
              <h3 className="mb-1">{msg.subject}</h3>
              <div className="text-[13px] text-muted">
                <span className="font-medium text-ink">{fromLabel(msg)}</span>
                {msg.from?.address ? ` <${msg.from.address}>` : ""}
              </div>
              <div className="text-[12px] text-neutral-500">
                To: {msg.toRecipients.map((r) => r.name || r.address).join(", ") || "—"}
                {msg.receivedDateTime ? ` · ${new Date(msg.receivedDateTime).toLocaleString()}` : ""}
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((c) => <span key={c} className="tag tag-accent text-[11px]">{c}</span>)}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button className="btn btn-secondary text-[13px]" onClick={() => { setPanel(panel === "reply" ? null : "reply"); setReplyText(""); }}>
                  <Reply className="h-4 w-4" /> Reply
                </button>
                <button className="btn btn-secondary text-[13px]" onClick={() => act(() => archiveEmail(msg.id), "Archived", { refreshList: true })} disabled={pending}>
                  <Archive className="h-4 w-4" /> Archive
                </button>
                <button className="btn btn-secondary text-[13px]" onClick={() => act(() => markEmail(msg.id, false), "Marked unread", { refreshList: true })} disabled={pending}>
                  <MailOpen className="h-4 w-4" /> Unread
                </button>
                <button className="btn btn-secondary text-[13px]" onClick={() => setPanel(panel === "tag" ? null : "tag")}>
                  <Tag className="h-4 w-4" /> Tag
                </button>
                {/* Create menu */}
                <span className="ml-1 flex items-center gap-1.5 border-l border-divider pl-2">
                  <span className="micro-label">Create</span>
                  <button className="btn btn-ghost text-[13px]" onClick={() => { setPanel("task"); setTaskDesc(`Follow up: ${msg.subject}`); }}>
                    <CheckSquare className="h-4 w-4" /> Task
                  </button>
                  <button className="btn btn-ghost text-[13px]" onClick={() => setPanel("lead")}>
                    <UserPlus className="h-4 w-4" /> Lead
                  </button>
                  <button className="btn btn-ghost text-[13px]" onClick={() => act(() => logEmailToLead({ emailId: msg.id, senderEmail }), "Logged to lead timeline")} disabled={pending}>
                    <History className="h-4 w-4" /> Log
                  </button>
                  <button className="btn btn-ghost text-[13px]" onClick={() => act(() => replyWithBookingLink(msg.id, baseUrl), "Booking link sent")} disabled={pending}>
                    <CalendarPlus className="h-4 w-4" /> Booking
                  </button>
                </span>
              </div>

              {notice && <p className="mt-2 text-[13px] text-accent-700">{notice}</p>}
              {error && <p className="mt-2 text-[13px] text-accent-700">{error}</p>}

              {/* Panels */}
              {panel === "reply" && (
                <div className="mt-3">
                  <textarea className="input" rows={5} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={`Reply to ${fromLabel(msg)}…`} autoFocus />
                  <div className="mt-2 flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={() => setPanel(null)} disabled={pending}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending || !replyText.trim()} onClick={() => act(() => replyEmail(msg.id, textToHtml(replyText)), "Reply sent")}>
                      {pending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </div>
              )}

              {panel === "tag" && (
                <div className="mt-3 border border-divider bg-bg p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TAGS.map((t) => {
                      const on = tags.includes(t);
                      return (
                        <button key={t} className={`tag ${on ? "tag-accent" : "tag-outline"}`} onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={() => setPanel(null)} disabled={pending}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending} onClick={() => act(() => tagEmail(msg.id, tags), "Tags saved", { refreshList: true })}>Save tags</button>
                  </div>
                </div>
              )}

              {panel === "task" && (
                <div className="mt-3 border border-divider bg-bg p-3 space-y-2">
                  <textarea className="input" rows={2} value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Task description" />
                  <div className="field"><label>Due (optional)</label><input type="date" className="input" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></div>
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={() => setPanel(null)} disabled={pending}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending || !taskDesc.trim()} onClick={() => act(() => createTaskFromEmail({ description: taskDesc, dueDate: taskDue || undefined, senderEmail }), "Task created")}>Create task</button>
                  </div>
                </div>
              )}

              {panel === "lead" && (
                <div className="mt-3 border border-divider bg-bg p-3 space-y-2">
                  <div className="field"><label>Name</label><input className="input" value={leadName} onChange={(e) => setLeadName(e.target.value)} /></div>
                  <div className="field"><label>Email</label><input className="input" value={senderEmail ?? ""} readOnly /></div>
                  <div className="field"><label>Company (optional)</label><input className="input" value={leadCompany} onChange={(e) => setLeadCompany(e.target.value)} /></div>
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={() => setPanel(null)} disabled={pending}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending || !senderEmail} onClick={() => act(() => createLeadFromEmail({ name: leadName, email: senderEmail, companyName: leadCompany || undefined }), "Lead saved")}>Save lead</button>
                  </div>
                </div>
              )}
            </div>

            {/* Body (sandboxed — no scripts) */}
            <iframe
              title="email-body"
              className="w-full flex-1 bg-white"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#201e1d;margin:16px;} img{max-width:100%;height:auto;} a{color:#ec3013;}</style></head><body>${msg.bodyHtml || "<p>(No content)</p>"}</body></html>`}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-accent-700">{error ?? "Failed to load."}</div>
        )}
      </div>
    </div>
  );
}
