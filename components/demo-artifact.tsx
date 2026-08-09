import type { DemoContent } from "@/lib/demos";

/**
 * Renders a sample deliverable (metric tiles + tables + narrative). Plain
 * component — used both in the client proposal wizard and the internal preview.
 * Shows a "sample" banner while the demo is still placeholder content.
 */
export function DemoArtifact({ demo }: { demo: DemoContent }) {
  return (
    <div>
      {demo.isPlaceholder && (
        <div className="no-print mb-6 border-2 border-accent bg-surface px-4 py-3 text-[13px]">
          <span className="micro-label text-accent">Sample deliverable</span> — an anonymized
          example of our work, not a real client&apos;s data. Replace with your real sample before
          sending to clients.
        </div>
      )}
      <div className="micro-label">A sample of our work</div>
      <h2 className="mt-2 text-[30px]">{demo.title}</h2>
      {demo.subtitle && <p className="mt-1 text-[15px] text-muted">{demo.subtitle}</p>}

      {demo.metrics.length > 0 && (
        <div className="mt-6 grid grid-cols-2 border-2 border-ink md:grid-cols-4">
          {demo.metrics.map((m, i) => (
            <div
              key={i}
              className={cnBorder(i)}
            >
              <div className="font-heading text-[24px] font-extrabold [font-variant-numeric:tabular-nums]">
                {m.value}
              </div>
              <div className="micro-label mt-1">{m.label}</div>
              {m.hint && <div className="mt-0.5 text-[11px] text-muted">{m.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {demo.tables.map((t, ti) => (
        <div key={ti} className="mt-8">
          <div className="micro-label">{t.title}</div>
          <div className="overflow-x-auto">
            <table className="table mt-2 w-full">
              <thead>
                <tr>
                  {t.columns.map((c, ci) => (
                    <th key={ci} className={ci === 0 ? "" : "num"}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={ci === 0 ? "" : "num"}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {demo.narrative && (
        <p className="mt-8 max-w-[60ch] text-[15px] leading-relaxed text-muted">{demo.narrative}</p>
      )}
    </div>
  );
}

function cnBorder(i: number) {
  const parts = ["px-4 py-5"];
  if (i % 2 === 1) parts.push("border-l-2 border-divider");
  parts.push("md:border-l-2 md:border-divider");
  if (i % 4 === 0) parts.push("md:border-l-0");
  if (i < 2) parts.push("border-b-2 border-divider md:border-b-0");
  return parts.join(" ");
}
