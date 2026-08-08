import { PageHeader } from "@/components/page-header";
import { poolMetrics } from "@/lib/work/metrics";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const shortWeek = (w: string) => w.replace(/^\d{4}-/, "");

function utilBand(v: number | null): string {
  if (v == null) return "";
  if (v >= 0.85) return "text-accent-700";
  if (v >= 0.7) return "";
  return "text-muted";
}

export default async function MetricsPage() {
  const m = await poolMetrics();

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Pool metrics"
        description="Forward bench (the hiring trigger) and trailing-8-week utilization per resource. Sustained bench under 10% for six weeks is the signal to stand up the next book."
      />

      {m.benchAlert && (
        <p className="mb-4 tag tag-accent inline-block">
          Hiring trigger: bench under 10% across the next 6 weeks — stand up the next book.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="micro-label mb-2">Forward bench (next 8 weeks)</div>
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">Confirmed</th>
                <th className="num">Bench</th>
                <th className="num">Bench %</th>
              </tr>
            </thead>
            <tbody>
              {m.weeks.map((w) => (
                <tr key={w.isoWeek}>
                  <td className="font-heading font-extrabold">{shortWeek(w.isoWeek)}</td>
                  <td className="num">{w.confirmed}h</td>
                  <td className="num">{w.bench}h</td>
                  <td className={`num ${w.benchPct != null && w.benchPct < 0.1 ? "text-accent-700" : ""}`}>{pct(w.benchPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="micro-label mb-2">Utilization (trailing 8 weeks)</div>
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Band</th>
                <th className="num">Consumed</th>
                <th className="num">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {m.resources.length === 0 ? (
                <tr><td colSpan={4} className="text-muted">No resources yet.</td></tr>
              ) : (
                m.resources.map((r) => (
                  <tr key={r.id}>
                    <td className="font-heading font-extrabold">{r.name}</td>
                    <td className="text-muted">{r.band}</td>
                    <td className="num">{r.trailingConsumed}h</td>
                    <td className={`num ${utilBand(r.utilPct)}`}>{pct(r.utilPct)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-[13px] text-muted">
        Unbooked consumption (time logged with no prior booking) in the last 8 weeks:{" "}
        <strong>{m.unbookedCount}</strong> booking{m.unbookedCount === 1 ? "" : "s"}. High counts mean the pool is being
        used without going through the board — the inverse of hoarding.
      </p>
    </div>
  );
}
