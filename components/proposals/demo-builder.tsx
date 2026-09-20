"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { MicroLabel } from "@/components/micro-label";
import { updateDemos } from "@/app/(dashboard)/proposals/actions";

type DemoOption = { key: string; name: string; serviceLine: string };

export function DemoBuilder({
  proposalId,
  locked,
  demoKeys,
  demos,
  onSaved,
}: {
  proposalId: string;
  locked: boolean;
  demoKeys: string[];
  demos: DemoOption[];
  onSaved?: (hasDemo: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(demoKeys);

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateDemos(proposalId, selected);
      if (!res.ok) {
        setMsg("Failed to save");
        return;
      }
      onSaved?.(selected.length > 0);
      router.refresh();
    });
  };

  return (
    <div className="border-2 border-ink">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-surface px-4 py-3">
        <div>
          <MicroLabel>Demo builder</MicroLabel>
          <div className="mt-0.5 text-[13px] text-muted">
            Include one or more anonymized samples of our work — at least one is required.
          </div>
        </div>
        {!locked && (
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            Save deliverables
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="space-y-2">
          {demos.map((d) => {
            const on = selected.includes(d.key);
            return (
              <div
                key={d.key}
                className={`flex items-center justify-between gap-3 border p-3 ${
                  on ? "border-ink bg-surface" : "border-divider"
                }`}
              >
                <label className="flex flex-1 items-center gap-3" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked || pending}
                    onChange={() => toggle(d.key)}
                  />
                  <span className="text-[14px]">
                    <span className="font-heading font-extrabold">{d.name}</span>
                    <span className="micro-label ml-2 align-middle text-accent">
                      {d.serviceLine}
                    </span>
                  </span>
                </label>
                <a
                  className="btn btn-ghost btn-sm"
                  href={`/demo/${d.key}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </div>
            );
          })}
        </div>
        <p className="mt-3 max-w-[560px] text-[12px] text-muted">
          Each sample opens as a printable PDF (open in a new tab, then Print / Save as PDF).
          Auto-selected from the template by service line; add or remove here. Anonymized
          samples only — never a real client&apos;s data.
        </p>
        {msg && <p className="mt-2 text-[14px] text-accent-700">{msg}</p>}
      </div>
    </div>
  );
}
