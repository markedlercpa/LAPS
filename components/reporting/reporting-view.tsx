"use client";

import { useState } from "react";
import type { LapsRowDetailed, PipelineStageRow, RepRow } from "@/lib/reporting";
import type { ProposalStatus } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { RepTable } from "@/components/reporting/rep-table";
import { LapsDetailed } from "@/components/reporting/laps-detailed";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

type LapsBundle = { week: LapsRowDetailed[]; month: LapsRowDetailed[]; quarter: LapsRowDetailed[] };
type Tab = "laps" | "pipeline" | "reps";

export function ReportingView({
  laps,
  pipeline,
  reps,
}: {
  laps: LapsBundle;
  pipeline: { rows: PipelineStageRow[]; totalCount: number; totalValue: number };
  reps: RepRow[];
}) {
  const [tab, setTab] = useState<Tab>("laps");

  return (
    <div>
      <div className="seg">
        {(
          [
            ["laps", "Sales performance"],
            ["pipeline", "Open pipeline"],
            ["reps", "Sales reps"],
          ] as [Tab, string][]
        ).map(([v, label]) => (
          <label key={v} className="seg-opt">
            <input type="radio" name="reportTab" checked={tab === v} onChange={() => setTab(v)} />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-6">
        {tab === "laps" && <LapsDetailed laps={laps} />}
        {tab === "pipeline" && <Pipeline pipeline={pipeline} />}
        {tab === "reps" && <Reps reps={reps} />}
      </div>
    </div>
  );
}

function Pipeline({
  pipeline,
}: {
  pipeline: { rows: PipelineStageRow[]; totalCount: number; totalValue: number };
}) {
  const max = Math.max(1, ...pipeline.rows.map((r) => r.value));

  return (
    <div>
      <div className="grid grid-cols-2 border-y-2 border-divider">
        <div className="border-r border-divider px-4 pb-6 pt-4">
          <div className="micro-label">Open proposals</div>
          <div className="mt-3 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {pipeline.totalCount}
          </div>
        </div>
        <div className="px-4 pb-6 pt-4">
          <div className="micro-label">Open pipeline value</div>
          <div className="mt-3 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {formatCurrency(pipeline.totalValue)}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <MicroLabel>Open pipeline by stage</MicroLabel>
        {pipeline.rows.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">No open proposals in the pipeline.</p>
        ) : (
          <div className="mt-4 border-t-2 border-divider">
            {pipeline.rows.map((r, i) => (
              <div
                key={r.status}
                className="grid grid-cols-[150px_1fr_170px] items-center gap-6 border-b border-divider py-4 max-sm:grid-cols-[110px_1fr]"
              >
                <div className="micro-label">
                  {PROPOSAL_STATUS_LABELS[r.status as ProposalStatus] ?? r.status}
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-6"
                    style={{
                      width: `${Math.max(4, (r.value / max) * 100)}%`,
                      background: i === 0 ? "var(--color-text)" : "var(--color-neutral-600)",
                    }}
                  />
                  <span className="text-[12px] text-muted">{r.count} deals</span>
                </div>
                <div className="text-right font-heading text-[18px] font-extrabold [font-variant-numeric:tabular-nums] max-sm:hidden">
                  {formatCurrency(r.value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Reps({ reps }: { reps: RepRow[] }) {
  const max = Math.max(1, ...reps.map((r) => r.wonValue));

  return (
    <div>
      <MicroLabel>Closed-won volume by rep</MicroLabel>
      <div className="mt-4 flex h-[220px] items-end gap-14 border-b-2 border-divider pl-2">
        {reps.map((r) => (
          <div key={r.repId} className="flex w-[130px] flex-col items-start justify-end">
            <div className="mb-2 font-heading text-[14px] font-extrabold [font-variant-numeric:tabular-nums]">
              {formatCurrency(r.wonValue)}
            </div>
            <div
              className="w-full"
              style={{ height: `${(r.wonValue / max) * 170}px`, background: "var(--color-text)" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-14 pl-2 pt-3">
        {reps.map((r) => (
          <div key={r.repId} className="w-[130px] text-[12px] text-muted">
            {r.repName}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <RepTable reps={reps} />
      </div>
    </div>
  );
}
