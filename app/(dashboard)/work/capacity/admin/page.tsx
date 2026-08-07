import { PageHeader } from "@/components/page-header";
import { AddRateButton } from "@/components/work/add-rate";
import { KarbonSyncButton } from "@/components/work/karbon-sync";
import { listRoleBands } from "@/lib/work/capacity";
import { karbonConfigured } from "@/lib/work/karbon";
import { centsToUsd } from "@/lib/work-taxonomy";

export const dynamic = "force-dynamic";

export default async function CapacityAdminPage() {
  const bands = await listRoleBands();
  const configured = karbonConfigured();

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Admin"
        description="Role-band rates (effective-dated — charging uses the rate in effect on each booking's week) and the Karbon actuals sync."
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
                        .map((r) => `${centsToUsd(r.loadedRateCents)} from ${r.effectiveFrom.toISOString().slice(0, 10)}`)
                        .slice(0, 3)
                        .join("; ")}
                </td>
                <td className="text-right"><AddRateButton band={{ id: b.id, name: b.name }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-8 micro-label mb-2">Karbon actuals sync</div>
      <div className="card p-4">
        <p className="mb-3 text-[13px] text-muted">
          One-directional (Karbon → Pulse). Pulls the trailing 8 weeks of time entries, matches them by resource email
          and work-item key, and lands consumed hours on each engagement. Runs nightly; use “Sync now” to pull on demand.
          Unmatched people/work items are reported below so you can fix the email or Karbon key.
        </p>
        <KarbonSyncButton configured={configured} />
      </div>
    </div>
  );
}
