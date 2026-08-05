"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MicroLabel } from "@/components/micro-label";
import { updateDemo } from "@/app/(dashboard)/proposals/actions";

type DemoOption = { key: string; name: string; serviceLine: string };

export function DemoBuilder({
  proposalId,
  locked,
  demoKey,
  demos,
  onSaved,
}: {
  proposalId: string;
  locked: boolean;
  demoKey: string | null;
  demos: DemoOption[];
  onSaved?: (hasDemo: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const changeDemo = (key: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateDemo(proposalId, key);
      if (!res.ok) {
        setMsg("Failed to attach demo");
        return;
      }
      onSaved?.(Boolean(key));
      router.refresh();
    });
  };

  return (
    <div className="border-2 border-ink">
      <div className="border-b-2 border-ink bg-surface px-4 py-3">
        <MicroLabel>Demo builder</MicroLabel>
        <div className="mt-0.5 text-[13px] text-muted">
          Attach an anonymized sample of our work — required before the proposal unlocks.
        </div>
      </div>
      <div className="p-4">
        <div className="field" style={{ maxWidth: 520 }}>
          <label>Sample deliverable (shown to the client)</label>
          <select
            className="input"
            value={demoKey ?? ""}
            disabled={locked || pending}
            onChange={(e) => changeDemo(e.target.value)}
          >
            <option value="">— none (required) —</option>
            {demos.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {demoKey && (
          <a
            className="btn btn-secondary mt-3"
            href={`/demos/${demoKey}`}
            target="_blank"
            rel="noreferrer"
          >
            Preview sample
          </a>
        )}
        <p className="mt-3 max-w-[520px] text-[12px] text-muted">
          Auto-attached from the template by service line; change it here if needed. Use
          anonymized samples only — never a real client&apos;s data.
        </p>
        {msg && <p className="mt-2 text-[14px] text-accent-700">{msg}</p>}
      </div>
    </div>
  );
}
