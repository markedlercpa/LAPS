import type { RepRow } from "@/lib/reporting";
import { formatCurrency } from "@/lib/utils";

export function RepTable({ reps }: { reps: RepRow[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Rep</th>
          <th className="num">Proposals</th>
          <th className="num">Won</th>
          <th className="num">Won value</th>
          <th className="num">Close rate</th>
          <th className="num">Avg cycle</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((r) => (
          <tr key={r.repId}>
            <td className="font-heading font-extrabold">{r.repName}</td>
            <td className="num">{r.proposalsCount}</td>
            <td className="num">{r.wonCount}</td>
            <td className="num font-semibold">{formatCurrency(r.wonValue)}</td>
            <td className="num">{(r.closeRate * 100).toFixed(0)}%</td>
            <td className="num">{r.avgCycleDays != null ? `${r.avgCycleDays}d` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
