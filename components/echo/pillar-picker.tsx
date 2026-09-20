"use client";

import type { QoOPillar } from "@prisma/client";
import { PILLARS, PILLAR_LABELS } from "@/lib/echo-taxonomy";
import { cn } from "@/lib/utils";

export function PillarPicker({
  value,
  onChange,
}: {
  value: QoOPillar[];
  onChange: (v: QoOPillar[]) => void;
}) {
  const toggle = (p: QoOPillar) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-wrap gap-2">
      {PILLARS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => toggle(p)}
          className={cn("tag", value.includes(p) ? "tag-accent" : "tag-outline")}
        >
          {PILLAR_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
