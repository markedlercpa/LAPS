"use client";

import { useState } from "react";
import { Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopingCard } from "./scoping-card";
import { DemoBuilder } from "./demo-builder";
import { ProposalEditor } from "./proposal-editor";

/**
 * Internal proposal workspace as three gated steps: Scoping → Demo Builder →
 * Proposal. Each tab is locked until the preceding step is completed and saved
 * (scope costed, then a demo attached).
 */
export function ProposalWorkspace({
  scoped,
  hasDemo,
  scopingProps,
  demoProps,
  editorProps,
}: {
  scoped: boolean;
  hasDemo: boolean;
  scopingProps: Omit<React.ComponentProps<typeof ScopingCard>, "onSaved">;
  demoProps: Omit<React.ComponentProps<typeof DemoBuilder>, "onSaved">;
  editorProps: React.ComponentProps<typeof ProposalEditor>;
}) {
  const TABS = ["Scoping", "Demo Builder", "Proposal"];
  const done = [scoped, hasDemo, false];
  const canOpen = (i: number) => i === 0 || (i === 1 && scoped) || (i === 2 && scoped && hasDemo);
  // Land on the first incomplete step (Proposal once both are done).
  const [active, setActive] = useState(!scoped ? 0 : !hasDemo ? 1 : 2);

  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t, i) => {
          const open = canOpen(i);
          return (
            <button
              key={t}
              disabled={!open}
              onClick={() => open && setActive(i)}
              className={cn(
                "flex items-center gap-2 border-2 px-4 py-2 font-heading text-[13px] font-extrabold uppercase tracking-[0.04em]",
                active === i
                  ? "border-ink bg-ink text-bg"
                  : open
                    ? "border-divider bg-surface text-ink hover:border-ink"
                    : "cursor-not-allowed border-divider bg-surface text-muted opacity-50",
              )}
            >
              <span className="tabular-nums">{i + 1}</span>
              {t}
              {!open ? (
                <Lock className="h-3.5 w-3.5" />
              ) : done[i] ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className={active === 0 ? "block" : "hidden"}>
        <ScopingCard
          {...scopingProps}
          onSaved={(s) => {
            if (s) setActive(1);
          }}
        />
      </div>
      <div className={active === 1 ? "block" : "hidden"}>
        <DemoBuilder
          {...demoProps}
          onSaved={(h) => {
            if (h) setActive(2);
          }}
        />
      </div>
      <div className={active === 2 ? "block" : "hidden"}>
        <ProposalEditor {...editorProps} />
      </div>
    </div>
  );
}
