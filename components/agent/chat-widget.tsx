"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Check, Ban, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Embedded Pulse assistant — a floating, right-anchored chat drawer available on
 * every dashboard page. Reads run server-side automatically; any write pauses
 * for an in-chat confirmation card before it executes. The transcript lives in
 * client state (ephemeral, cleared on reload) and is re-sent to /api/agent/chat
 * each turn so the route stays stateless.
 */

// Opaque Anthropic message-param objects; the client only stores + resends them.
type Transcript = unknown[];

type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "confirm"; summary: string; toolName: string; resolved?: "confirm" | "reject" }
  | { kind: "note"; text: string };

type TurnResult =
  | { type: "message"; text: string; messages: Transcript }
  | { type: "confirm"; summary: string; toolName: string; pending: unknown; messages: Transcript }
  | { type: "error"; error: string; messages: Transcript };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const transcriptRef = useRef<Transcript>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, busy]);

  async function post(body: { messages: Transcript; decision?: "confirm" | "reject" }) {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 503) {
      return { type: "error", error: "The assistant isn't configured yet (ANTHROPIC_API_KEY).", messages: body.messages } as TurnResult;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { type: "error", error: j?.error ?? `Request failed (${res.status}).`, messages: body.messages } as TurnResult;
    }
    return (await res.json()) as TurnResult;
  }

  function handleResult(result: TurnResult) {
    transcriptRef.current = result.messages ?? transcriptRef.current;
    if (result.type === "message") {
      setBubbles((b) => [...b, { kind: "assistant", text: result.text }]);
      setAwaitingConfirm(false);
    } else if (result.type === "confirm") {
      setBubbles((b) => [...b, { kind: "confirm", summary: result.summary, toolName: result.toolName }]);
      setAwaitingConfirm(true);
    } else {
      setBubbles((b) => [...b, { kind: "note", text: `⚠ ${result.error}` }]);
      setAwaitingConfirm(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || awaitingConfirm) return;
    setInput("");
    setBubbles((b) => [...b, { kind: "user", text }]);
    const messages = [...transcriptRef.current, { role: "user", content: text }];
    transcriptRef.current = messages;
    setBusy(true);
    try {
      handleResult(await post({ messages }));
    } catch {
      setBubbles((b) => [...b, { kind: "note", text: "⚠ Network error. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "confirm" | "reject") {
    if (busy) return;
    setBubbles((b) => {
      const copy = [...b];
      for (let i = copy.length - 1; i >= 0; i--) {
        const item = copy[i];
        if (item.kind === "confirm" && !item.resolved) {
          copy[i] = { ...item, resolved: decision };
          break;
        }
      }
      return copy;
    });
    setAwaitingConfirm(false);
    setBusy(true);
    try {
      handleResult(await post({ messages: transcriptRef.current, decision }));
    } catch {
      setBubbles((b) => [...b, { kind: "note", text: "⚠ Network error. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    transcriptRef.current = [];
    setBubbles([]);
    setAwaitingConfirm(false);
    setInput("");
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center bg-accent text-bg shadow-lg transition-transform hover:scale-105"
          aria-label="Open Pulse assistant"
          title="Pulse assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-[color-mix(in_srgb,#000_45%,transparent)]"
            onMouseDown={() => setOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-[420px] flex-col border-l-2 border-ink bg-surface shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="font-heading text-[15px] font-extrabold">Pulse Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                {bubbles.length > 0 && (
                  <button className="btn btn-ghost text-[12px]" onClick={reset} disabled={busy}>
                    Clear
                  </button>
                )}
                <button
                  className="btn-icon text-neutral-500 hover:text-accent"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {bubbles.length === 0 && (
                <div className="mt-6 text-[13px] text-muted">
                  <p className="mb-2 font-heading font-extrabold text-ink">Ask me to run tasks in Pulse.</p>
                  <p className="mb-1">Reads happen instantly. Writes (create, update, delete, send, book) show a confirmation card before anything changes.</p>
                  <ul className="mt-3 list-disc space-y-1 pl-4">
                    <li>“What’s in my pipeline at proposal stage?”</li>
                    <li>“Add a task to follow up with the Acme lead Friday.”</li>
                    <li>“Create a lead for Jane Doe at Contoso, jane@contoso.com.”</li>
                    <li>“Show my upcoming appointments.”</li>
                  </ul>
                </div>
              )}

              {bubbles.map((b, i) => (
                <BubbleView key={i} bubble={b} onDecide={decide} busy={busy} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t-2 border-ink p-3">
              <div className="flex items-end gap-2">
                <textarea
                  className="input min-h-[44px] flex-1"
                  rows={1}
                  placeholder={awaitingConfirm ? "Confirm or decline the action above…" : "Message the assistant…"}
                  value={input}
                  disabled={busy || awaitingConfirm}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  className="btn btn-primary btn-icon"
                  onClick={() => void send()}
                  disabled={busy || awaitingConfirm || !input.trim()}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function BubbleView({
  bubble,
  onDecide,
  busy,
}: {
  bubble: Bubble;
  onDecide: (d: "confirm" | "reject") => void;
  busy: boolean;
}) {
  if (bubble.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap bg-accent px-3 py-2 text-[13px] text-bg">
          {bubble.text}
        </div>
      </div>
    );
  }
  if (bubble.kind === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] whitespace-pre-wrap border border-divider bg-bg px-3 py-2 text-[13px]">
          {bubble.text}
        </div>
      </div>
    );
  }
  if (bubble.kind === "note") {
    return <div className="text-[12px] text-accent-700">{bubble.text}</div>;
  }
  // confirm card
  return (
    <div className="border-2 border-ink bg-bg p-3">
      <div className="micro-label mb-1">Confirm action · {bubble.toolName}</div>
      <p className="mb-2 text-[13px]">{bubble.summary}</p>
      {bubble.resolved ? (
        <div className={cn("text-[12px]", bubble.resolved === "confirm" ? "text-accent-700" : "text-muted")}>
          {bubble.resolved === "confirm" ? "✓ Confirmed" : "✕ Declined"}
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="btn btn-primary text-[12px]" onClick={() => onDecide("confirm")} disabled={busy}>
            <Check className="h-3.5 w-3.5" /> Confirm
          </button>
          <button className="btn btn-secondary text-[12px]" onClick={() => onDecide("reject")} disabled={busy}>
            <Ban className="h-3.5 w-3.5" /> Decline
          </button>
        </div>
      )}
    </div>
  );
}
