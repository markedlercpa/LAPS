"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, ExternalLink, Settings2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { listTimezones } from "@/lib/booking-time";
import { updateHost } from "@/app/(dashboard)/scheduling/actions";

export type HostSettingsData = {
  slug: string;
  displayName: string | null;
  timezone: string;
  zoomLink: string | null;
  welcome: string | null;
  active: boolean;
};

export function HostSettings({ host, baseUrl }: { host: HostSettingsData; baseUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState(host.slug);
  const [displayName, setDisplayName] = useState(host.displayName ?? "");
  const [timezone, setTimezone] = useState(host.timezone);
  const [zoomLink, setZoomLink] = useState(host.zoomLink ?? "");
  const [welcome, setWelcome] = useState(host.welcome ?? "");
  const [active, setActive] = useState(host.active);

  const publicUrl = `${baseUrl}/book/${host.slug}`;

  const copy = () => {
    navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateHost({ slug, displayName, timezone, zoomLink, welcome, active });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="border-2 border-divider bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="micro-label">Your booking page</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="truncate bg-bg px-2 py-1 text-[13px]">{publicUrl}</code>
            <button className="btn btn-ghost text-[13px]" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a className="btn btn-ghost text-[13px]" href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px] text-muted">
            <span>Timezone: {host.timezone}</span>
            <span>·</span>
            <span>Zoom: {host.zoomLink ? "set" : "not set"}</span>
            <span>·</span>
            <span>{host.active ? "Live" : "Off"}</span>
          </div>
        </div>
        <button className="btn btn-secondary shrink-0" onClick={() => setOpen(true)}>
          <Settings2 className="h-4 w-4" /> Edit
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Booking page settings">
        <div className="space-y-3">
          <div className="field">
            <label>Link handle</label>
            <div className="flex items-center gap-1 text-[13px] text-muted">
              <span>{baseUrl}/book/</span>
              <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Mark Edler" />
          </div>
          <div className="field">
            <label>Timezone</label>
            <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {listTimezones().map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Default Zoom link</label>
            <input className="input" value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/your-personal-room" />
          </div>
          <div className="field">
            <label>Welcome message (optional)</label>
            <textarea className="input" rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Booking page is live
          </label>
        </div>
        {error && <p className="mt-2 text-[14px] text-accent-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </Modal>
    </div>
  );
}
