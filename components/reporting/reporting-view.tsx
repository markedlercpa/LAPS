"use client";

import { useState } from "react";
import type { LapsRow, PipelineStageRow, RepRow } from "@/lib/reporting";
import type { ProposalStatus } from "@prisma/client";
import { MicroLabel } from "@/components/micro-label";
import { RepTable } from "@/components/reporting/rep-table";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, cn } from "@/lib/utils";

type LapsBundle = { week: LapsRow[]; month: LapsRow[]; quarter: LapsRow[] };
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
        {tab === "laps" && <LapsPerformance laps={laps} />}
        {tab === "pipeline" && <Pipeline pipeline={pipeline} />}
        {tab === "reps" && <Reps reps={reps} />}
      </div>
    </div>
  );
}

const SERIES = [
  { key: "newLeads", label: "Leads", color: "var(--color-text)" },
  { key: "apptsBooked", label: "Appts", color: "var(--color-neutral-700)" },
  { key: "proposalsSent", label: "Proposals", color: "var(--color-neutral-400)" },
  { key: "dealsWon", label: "Won", color: "var(--color-accent)" },
] as const;

function LapsPerformance({ laps }: { laps: LapsBundle }) {
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("week");
  const data = laps[period];
  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.newLeads, d.apptsBooked, d.proposalsSent, d.dealsWon]),
  );

  return (
    <div>
      <div className="seg">
        {(["week", "month", "quarter"] as const).map((p) => (
          <label key={p} className="seg-opt capitalize">
            <input type="radio" name="period" checked={period === p} onChange={() => setPeriod(p)} />
            {p}ly
          </label>
        ))}
      </div>

      {/* Chart */}
      <div className="mt-6 border-t-2 border-divider pt-6">
        <div className="flex items-center justify-between">
          <MicroLabel>Sales throughput</MicroLabel>
          <div className="flex flex-wrap gap-4">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5" style={{ background: s.color }} />
                <span className="micro-label">{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex h-[230px] items-end gap-4 border-b-2 border-divider">
          {data.map((d) => (
            <div key={d.label} className="flex flex-1 items-end justify-center gap-[3px]">
              {SERIES.map((s) => (
                <div
                  key={s.key}
                  className="w-[11px]"
                  style={{
                    height: `${((d[s.key as keyof LapsRow] as number) / max) * 200}px`,
                    background: s.color,
                  }}
                  title={`${s.label}: ${d[s.key as keyof LapsRow]}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex gap-4 py-3">
          {data.map((d) => (
            <div key={d.label} className="flex-1 text-center text-[11px] text-muted">
              {d.label}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="table mt-6">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">Leads</th>
            <th className="num">Appts booked</th>
            <th className="num">Appts completed</th>
            <th className="num">Proposals sent</th>
            <th className="num">Deals won</th>
            <th className="num">Won value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.label}>
              <td className="font-heading font-extrabold">{r.label}</td>
              <td className="num">{r.newLeads || "—"}</td>
              <td className="num">{r.apptsBooked || "—"}</td>
              <td className="num">{r.apptsCompleted || "—"}</td>
              <td className="num">{r.proposalsSent || "—"}</td>
              <td className="num">{r.dealsWon || "—"}</td>
              <td className="num font-semibold">{r.wonValue ? formatCurrency(r.wonValue) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
