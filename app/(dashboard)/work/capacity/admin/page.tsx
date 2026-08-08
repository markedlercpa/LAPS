import { PageHeader } from "@/components/page-header";
import { AddRateButton } from "@/components/work/add-rate";
import { listRoleBands } from "@/lib/work/capacity";
import { centsToUsd } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function CapacityAdminPage() {
  const bands = await listRoleBands();

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Admin"
        description="Role-band rates — effective-dated, so charging uses the rate in effect on each booking's week. Add a new row to change a rate; history is never overwritten."
      />

      <div className="micro-label mb-2">Role bands & loaded rates</div>
      <table className="table">
        <thead>
          <tr>
            <th>Band</th>
            <th className="num">Current loaded rate</th>
            <th className="num">Bill rate</th>
            <th>Rate history</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => {
            const current = b.rates[0]; // rates sorted desc by effectiveFrom
            return (
              <tr key={b.id}>
                <td className="font-heading font-extrabold">{b.name}</td>
                <td className="num">{current ? `${centsToUsd(current.loadedRateCents)}/h` : <span className="text-accent-700">not set</span>}</td>
                <td className="num">{current?.billRateCents != null ? `${centsToUsd(current.billRateCents)}/h` : "—"}</td>
                <td className="text-muted">
                  {b.rates.length === 0
                    ? "—"
                    : b.rates
                        .map((r) => `${centsToUsd(r.loadedRateCents)}${r.fiscalYear ? ` (FY${r.fiscalYear})` : ""} from ${r.effectiveFrom.toISOString().slice(0, 10)}`)
                        .slice(0, 3)
                        .join("; ")}
                </td>
                <td className="text-right"><AddRateButton band={{ id: b.id, name: b.name }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
