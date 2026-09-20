"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Target } from "lucide-react";
import type { LapsRowDetailed, Period, TargetSet } from "@/lib/reporting";
import { MicroLabel } from "@/components/micro-label";
import { saveTargetAction } from "@/app/(dashboard)/reporting/actions";
import { formatCurrency, cn } from "@/lib/utils";

type Bundle = { week: LapsRowDetailed[]; month: LapsRowDetailed[]; quarter: LapsRowDetailed[] };

const METRICS = [
  { key: "newLeads", tKey: "leads", label: "Leads", detail: "leads" },
  { key: "apptsBooked", tKey: "apptsBooked", label: "Appts", detail: "appts" },
  { key: "proposalsSent", tKey: "proposalsSent", label: "Proposals", detail: "proposals" },
  { key: "dealsWon", tKey: "dealsWon", label: "Won", detail: "deals" },
] as const;

export function LapsDetailed({ laps }: { laps: Bundle }) {
  const [period, setPeriod] = useState<Period>("week");
  const data = laps[period];

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

      <p className="mt-4 text-[13px] text-muted">
        Click a period to see the underlying leads, appointments, proposals, and deals. Set targets to track hit / miss.
      </p>

      <div className="mt-4 border-t-2 border-divider">
        {data.map((row) => (
          <PeriodRow key={row.startKey} row={row} period={period} />
        ))}
      </div>
    </div>
  );
}

function pct(actual: number, target: number | null | undefined): string | null {
  if (target == null || target === 0) return null;
  return `${Math.round((actual / target) * 100)}%`;
}

function PeriodRow({ row, period }: { row: LapsRowDetailed; period: Period }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-b border-divider">
      <div className="grid grid-cols-[24px_130px_repeat(4,1fr)_150px] items-center gap-3 py-3 max-md:grid-cols-[24px_1fr] max-md:gap-y-2">
        <button onClick={() => setOpen((v) => !v)} className="text-neutral-600 hover:text-ink" aria-label="Toggle detail">
          <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        </button>
        <button onClick={() => setOpen((v) => !v)} className="text-left font-heading font-extrabold">
          {row.label}
        </button>
        {METRICS.map((m) => {
          const actual = row[m.key] as number;
          const target = row.targets?.[m.tKey as keyof TargetSet] ?? null;
          const p = pct(actual, target as number | null);
          const hit = target != null && actual >= (target as number);
          return (
            <div key={m.key} className="max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-2">
              <span className="hidden micro-label max-md:inline">{m.label}</span>
              <div>
                <div className="font-heading text-[16px] font-extrabold [font-variant-numeric:tabular-nums]">{actual}</div>
                {p && (
                  <div className={cn("text-[11px]", hit ? "text-accent-700" : "text-muted")}>
                    {actual}/{target as number} · {p}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="text-right max-md:text-left">
          <div className="font-heading text-[15px] font-extrabold [font-variant-numeric:tabular-nums]">
            {row.wonValue ? formatCurrency(row.wonValue) : "—"}
          </div>
          <button className="text-[11px] text-accent-700" onClick={() => setEditing((v) => !v)}>
            <Target className="mr-1 inline h-3 w-3" />
            {row.targets ? "Edit target" : "Set target"}
          </button>
        </div>
      </div>

      {editing && <TargetEditor row={row} period={period} onClose={() => setEditing(false)} />}

      {open && (
        <div className="grid grid-cols-4 gap-6 border-t border-divider bg-surface/40 px-2 py-4 max-md:grid-cols-1">
          {METRICS.map((m) => {
            const items = row.detail[m.detail as keyof typeof row.detail];
            return (
              <div key={m.key}>
                <MicroLabel>{m.label} · {items.length}</MicroLabel>
                <div className="mt-2 space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted">—</p>
                  ) : (
                    items.map((it) => (
                      <a key={it.id} href={it.href} className="block text-[12px] no-underline">
                        <span className="text-accent-700">{it.label}</span>
                        <span className="block truncate text-muted">{it.sub}</span>
                      </a>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TargetEditor({ row, period, onClose }: { row: LapsRowDetailed; period: Period; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = row.targets;
  const [v, setV] = useState({
    leads: t?.leads?.toString() ?? "",
    apptsBooked: t?.apptsBooked?.toString() ?? "",
    proposalsSent: t?.proposalsSent?.toString() ?? "",
    dealsWon: t?.dealsWon?.toString() ?? "",
    wonValue: t?.wonValue?.toString() ?? "",
  });
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = () =>
    startTransition(async () => {
      await saveTargetAction(period, row.startKey, {
        leads: num(v.leads),
        apptsBooked: num(v.apptsBooked),
        proposalsSent: num(v.proposalsSent),
        dealsWon: num(v.dealsWon),
        wonValue: num(v.wonValue),
      });
      onClose();
      router.refresh();
    });

  const fields: [keyof typeof v, string][] = [
    ["leads", "Leads"],
    ["apptsBooked", "Appts"],
    ["proposalsSent", "Proposals"],
    ["dealsWon", "Won deals"],
    ["wonValue", "Won value ($)"],
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-divider bg-surface/40 px-2 py-3">
      {fields.map(([k, label]) => (
        <label key={k} className="field">
          <span className="micro-label">{label}</span>
          <input className="input w-[110px] py-1.5 text-[13px]" type="number" value={v[k]} onChange={(e) => set(k, e.target.value)} />
        </label>
      ))}
      <button className="btn btn-primary text-[13px]" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save target"}</button>
      <button className="btn btn-ghost text-[13px]" onClick={onClose} disabled={pending}>Cancel</button>
    </div>
  );
}
