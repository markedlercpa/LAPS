import { PageHeader } from "@/components/page-header";
import { getRateCard } from "@/lib/rate-card";
import { RateCardEditor } from "@/components/settings/rate-card-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const rows = await getRateCard();

  return (
    <div>
      <PageHeader
        eyebrow="06 — Settings"
        title="Settings"
        description="Firm configuration used across the app."
      />

      <section>
        <h2 className="mb-1 text-[22px]">Rate card</h2>
        <p className="mb-4 max-w-[60ch] text-muted">
          Standard hourly cost and billing rates by staff level. Every proposal&apos;s scoping
          card defaults its rates from here (overridable per deal). These are illustrative
          starters — set your real rates.
        </p>
        <RateCardEditor
          rows={rows.map((r) => ({ level: r.level, cost: r.cost, bill: r.bill }))}
        />
      </section>
    </div>
  );
}
