import { cn } from "@/lib/utils";

export type Metric = {
  label: string;
  value: string | number;
  note?: string;
  accent?: boolean;
};

/**
 * Rule-divided metric row — replaces the old StatCard grid. Top + bottom 2px
 * rules, 1px right rule between cells. Micro label, 34px heading value, note.
 */
export function MetricRow({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      className="grid border-y-2 border-divider"
      style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className={cn(
            "px-4 pb-6 pt-4",
            i < metrics.length - 1 && "border-r border-divider",
          )}
        >
          <div className="micro-label">{m.label}</div>
          <div
            className={cn(
              "mt-3 font-heading text-[34px] font-extrabold leading-none [font-variant-numeric:tabular-nums] tracking-[-0.02em]",
              m.accent && "text-accent-700",
            )}
          >
            {m.value}
          </div>
          {m.note && <div className="mt-2 text-[12px] text-muted">{m.note}</div>}
        </div>
      ))}
    </div>
  );
}
