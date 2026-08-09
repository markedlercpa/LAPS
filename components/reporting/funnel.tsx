import type { FunnelRow } from "@/lib/reporting";
import { MicroLabel } from "@/components/micro-label";

const TONE: Record<FunnelRow["tone"], string> = {
  ink: "var(--color-text)",
  n800: "var(--color-neutral-800)",
  n600: "var(--color-neutral-600)",
  accent: "var(--color-accent)",
};

export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="mt-14">
      <MicroLabel>Funnel · last 90 days</MicroLabel>
      <div className="mt-4 border-t-2 border-divider">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[230px_1fr_150px] items-center gap-6 border-b border-divider py-4 max-md:grid-cols-[140px_1fr]"
          >
            <div className="flex items-baseline gap-2">
              <span className="w-3.5 font-heading text-[13px] font-extrabold text-accent">
                {r.letter}
              </span>
              <span className="font-heading text-[17px] font-extrabold">{r.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="h-[26px]"
                style={{
                  width: `${Math.max(4, (r.count / max) * 100)}%`,
                  background: TONE[r.tone],
                }}
              />
              <span className="font-heading text-[22px] font-extrabold [font-variant-numeric:tabular-nums]">
                {r.count}
              </span>
            </div>
            <div className="text-right text-[12px] text-muted max-md:hidden">
              {r.convNote}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
